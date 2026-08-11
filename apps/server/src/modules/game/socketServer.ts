import type { AuthUser, ClientToServerEvents, ServerToClientEvents } from "@mahjong/shared";
import type { FastifyInstance } from "fastify";
import { Server, type Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";

import type { AuthService } from "../auth/authService.js";
import { createUnlimitedRateLimiter, type RateLimiter } from "../../security/rateLimiter.js";
import { createGameLobbyService, type GameLobbyService } from "./gameLobbyService.js";
import { createGameRoomService, type GameRoomService } from "./gameRoomService.js";
import { createRoomCoordinator, type RoomCoordinator } from "./roomCoordinator.js";
import { createRoomStateStore, type RoomStateStore } from "./roomStateStore.js";
import {
  createPlayerConnectionRegistry,
  type PlayerConnectionRegistry
} from "./playerConnectionRegistry.js";

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

type SocketData = {
  user: AuthUser;
};

type GameSocketOperation = "action" | "join" | "leave" | "lobby" | "start" | "sync";
type TimeoutHandle = ReturnType<typeof setTimeout>;

const playerOnlyErrors: Record<GameSocketOperation, string> = {
  action: "Only players can act in games",
  join: "Only players can join games",
  leave: "Only players can leave games",
  lobby: "Only players can watch lobby rooms",
  start: "Only players can start games",
  sync: "Only players can sync games"
};

export function readSocketToken(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readCookieToken(value: unknown, cookieName = "mahjong_session"): string | null {
  if (typeof value !== "string") return null;
  const entry = value
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`));
  return entry ? decodeURIComponent(entry.slice(cookieName.length + 1)) : null;
}

export function getGameSocketAccessError(
  user: AuthUser,
  operation: GameSocketOperation
): string | null {
  return user.role === "player" ? null : playerOnlyErrors[operation];
}

export const humanActionTimeoutMs = 30_000;
export const playerDisconnectGraceMs = 20_000;

export function shouldScheduleHumanActionTimeout(room: {
  lobbyRoomId?: string;
  state: { currentTurn: number; phase: string; players: { isBot: boolean }[] };
}): boolean {
  return (
    room.state.phase === "playing" &&
    Boolean(room.lobbyRoomId) &&
    room.state.players[room.state.currentTurn]?.isBot === false
  );
}

export function getDisconnectGraceKey(roomId: string, userId: number): string {
  return `${roomId}:${userId}`;
}

export function scheduleDisconnectGrace(input: {
  key: string;
  onExpire: () => void;
  pendingTimeouts: Map<string, TimeoutHandle>;
  timeoutMs?: number;
}): void {
  const existingTimeout = input.pendingTimeouts.get(input.key);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  const timeout = setTimeout(() => {
    if (input.pendingTimeouts.get(input.key) !== timeout) {
      return;
    }

    input.pendingTimeouts.delete(input.key);
    input.onExpire();
  }, input.timeoutMs ?? playerDisconnectGraceMs);
  input.pendingTimeouts.set(input.key, timeout);
}

export function cancelDisconnectGrace(
  pendingTimeouts: Map<string, TimeoutHandle>,
  key: string
): boolean {
  const timeout = pendingTimeouts.get(key);
  if (!timeout) {
    return false;
  }

  clearTimeout(timeout);
  pendingTimeouts.delete(key);
  return true;
}

export function getGameStartMode(hasActiveRoom: boolean): "create-quick-room" | "sync-active-room" {
  return hasActiveRoom ? "sync-active-room" : "create-quick-room";
}

function emitRoomState(
  socket: GameSocket,
  gameRoomService: GameRoomService,
  humanTurnDeadlinesByRoomId: Map<string, string>,
  roomId?: string
): void {
  const user = (socket.data as SocketData).user;
  const room = gameRoomService.getRoomForUser(user, roomId);
  if (!room) {
    socket.emit("game:error", { message: "No active game room" });
    return;
  }

  const turnDeadlineAt = humanTurnDeadlinesByRoomId.get(room.id);
  socket.emit("game:state", {
    view: gameRoomService.getPlayerView(room, user, turnDeadlineAt ? { turnDeadlineAt } : undefined)
  });
  if (room.state.phase === "ended") {
    socket.emit("game:ended", { reason: room.state.endReason ?? "ended" });
  }
}

function emitLatestRoomEvent(socket: GameSocket, room: { events: { text: string }[] }): void {
  const latestEvent = room.events.at(-1);
  if (latestEvent) {
    socket.emit("game:event", { message: latestEvent.text });
  }
}

function emitRoomStateToSockets(input: {
  gameRoomService: GameRoomService;
  humanTurnDeadlinesByRoomId: Map<string, string>;
  roomId: string;
  sockets: Iterable<GameSocket>;
}): void {
  for (const socket of input.sockets) {
    emitRoomState(socket, input.gameRoomService, input.humanTurnDeadlinesByRoomId, input.roomId);
  }
}

function emitLatestRoomEventToSockets(
  room: { events: { text: string }[] },
  sockets: Iterable<GameSocket>
): void {
  for (const socket of sockets) {
    emitLatestRoomEvent(socket, room);
  }
}

function syncLobbyRoomEnd(
  gameLobbyService: GameLobbyService,
  room: { id: string; lobbyRoomId?: string; state: { phase: string } }
): void {
  if (room.state.phase === "ended") {
    gameLobbyService.finishRoom(room.lobbyRoomId ?? room.id);
  }
}

function scheduleBots(input: {
  activeSocketsByRoomId: Map<string, Set<GameSocket>>;
  gameLobbyService: GameLobbyService;
  gameRoomService: GameRoomService;
  roomStateStore: RoomStateStore;
  humanTurnDeadlinesByRoomId: Map<string, string>;
  roomId: string;
  isStopping: () => boolean;
  scheduledBotTimeoutsByRoomId: Map<string, TimeoutHandle>;
  scheduledHumanTimeoutsByRoomId: Map<string, TimeoutHandle>;
}): void {
  if (input.isStopping()) {
    return;
  }

  const room = input.gameRoomService.getRoom(input.roomId);
  if (!room || room.state.phase === "ended") {
    return;
  }

  const isOpeningPhase =
    room.state.phase === "exchange-three" || room.state.phase === "choose-missing-suit";
  const hasPendingOpeningBot = isOpeningPhase
    ? room.state.players.some(
        (player) =>
          player.isBot &&
          (room.state.phase === "exchange-three"
            ? !room.state.exchangeThreeSelections?.[player.seatIndex]
            : !room.state.missingSuits?.[player.seatIndex])
      )
    : false;

  if (isOpeningPhase && !hasPendingOpeningBot) {
    return;
  }

  if (isOpeningPhase) {
    if (input.scheduledBotTimeoutsByRoomId.has(room.id)) {
      return;
    }
  }

  const player = room.state.players[room.state.currentTurn];
  if (!isOpeningPhase && !player?.isBot) {
    scheduleHumanTimeout(input);
    const latestSockets = input.activeSocketsByRoomId.get(input.roomId);
    if (latestSockets) {
      emitRoomStateToSockets({
        gameRoomService: input.gameRoomService,
        humanTurnDeadlinesByRoomId: input.humanTurnDeadlinesByRoomId,
        roomId: input.roomId,
        sockets: latestSockets
      });
    }
    return;
  }

  if (input.scheduledBotTimeoutsByRoomId.has(room.id)) {
    return;
  }

  const delayMs = 500 + Math.floor(Math.random() * 1500);
  const timeout = setTimeout(() => {
    input.scheduledBotTimeoutsByRoomId.delete(input.roomId);
    if (input.isStopping()) {
      return;
    }
    const latestRoom = input.gameRoomService.getRoom(input.roomId);
    if (!latestRoom) {
      return;
    }

    const latestSockets = input.activeSocketsByRoomId.get(input.roomId);
    if (latestRoom.state.phase === "ended") {
      if (latestSockets) {
        emitRoomStateToSockets({
          gameRoomService: input.gameRoomService,
          humanTurnDeadlinesByRoomId: input.humanTurnDeadlinesByRoomId,
          roomId: input.roomId,
          sockets: latestSockets
        });
      }
      return;
    }

    const latestPlayer = latestRoom.state.players[latestRoom.state.currentTurn];
    const latestIsOpeningPhase =
      latestRoom.state.phase === "exchange-three" ||
      latestRoom.state.phase === "choose-missing-suit";
    if (!latestIsOpeningPhase && !latestPlayer?.isBot) {
      if (latestSockets) {
        emitRoomStateToSockets({
          gameRoomService: input.gameRoomService,
          humanTurnDeadlinesByRoomId: input.humanTurnDeadlinesByRoomId,
          roomId: input.roomId,
          sockets: latestSockets
        });
      }
      return;
    }

    const botAdvanced = input.gameRoomService.applyNextBotAction(latestRoom);
    if (botAdvanced) {
      const snapshot = input.gameRoomService.getRecoverySnapshot(latestRoom.id);
      if (snapshot) void input.roomStateStore.set(snapshot);
    }
    syncLobbyRoomEnd(input.gameLobbyService, latestRoom);
    if (latestSockets) {
      emitLatestRoomEventToSockets(latestRoom, latestSockets);
      emitRoomStateToSockets({
        gameRoomService: input.gameRoomService,
        humanTurnDeadlinesByRoomId: input.humanTurnDeadlinesByRoomId,
        roomId: input.roomId,
        sockets: latestSockets
      });
    }
    scheduleBots(input);
  }, delayMs);
  input.scheduledBotTimeoutsByRoomId.set(room.id, timeout);
}

function scheduleHumanTimeout(input: {
  activeSocketsByRoomId: Map<string, Set<GameSocket>>;
  gameLobbyService: GameLobbyService;
  gameRoomService: GameRoomService;
  roomStateStore: RoomStateStore;
  humanTurnDeadlinesByRoomId: Map<string, string>;
  roomId: string;
  isStopping: () => boolean;
  scheduledBotTimeoutsByRoomId: Map<string, TimeoutHandle>;
  scheduledHumanTimeoutsByRoomId: Map<string, TimeoutHandle>;
}): void {
  if (input.isStopping()) {
    return;
  }

  const room = input.gameRoomService.getRoom(input.roomId);
  if (!room || room.state.phase !== "playing") {
    return;
  }

  if (!shouldScheduleHumanActionTimeout(room)) {
    input.humanTurnDeadlinesByRoomId.delete(room.id);
    return;
  }

  if (input.scheduledHumanTimeoutsByRoomId.has(room.id)) {
    return;
  }

  const scheduledState = room.state;
  input.humanTurnDeadlinesByRoomId.set(
    room.id,
    new Date(Date.now() + humanActionTimeoutMs).toISOString()
  );
  const timeout = setTimeout(() => {
    input.scheduledHumanTimeoutsByRoomId.delete(input.roomId);
    input.humanTurnDeadlinesByRoomId.delete(input.roomId);
    if (input.isStopping()) {
      return;
    }
    const latestRoom = input.gameRoomService.getRoom(input.roomId);
    if (!latestRoom || latestRoom.state !== scheduledState) {
      return;
    }

    const latestSockets = input.activeSocketsByRoomId.get(input.roomId);
    if (!input.gameRoomService.applyHumanTimeout(latestRoom)) {
      return;
    }
    const snapshot = input.gameRoomService.getRecoverySnapshot(latestRoom.id);
    if (snapshot) void input.roomStateStore.set(snapshot);
    syncLobbyRoomEnd(input.gameLobbyService, latestRoom);

    if (latestSockets) {
      for (const socket of latestSockets) {
        socket.emit("game:timeout", { message: "操作超时，已自动托管出牌" });
      }
      emitLatestRoomEventToSockets(latestRoom, latestSockets);
      emitRoomStateToSockets({
        gameRoomService: input.gameRoomService,
        humanTurnDeadlinesByRoomId: input.humanTurnDeadlinesByRoomId,
        roomId: input.roomId,
        sockets: latestSockets
      });
    }
    scheduleBots(input);
  }, humanActionTimeoutMs);

  input.scheduledHumanTimeoutsByRoomId.set(room.id, timeout);
}

export function registerGameSocketServer(input: {
  app: FastifyInstance;
  authService: AuthService;
  corsOrigins?: string[];
  gameLobbyService?: GameLobbyService;
  gameRoomService?: GameRoomService;
  playerConnectionRegistry?: PlayerConnectionRegistry;
  socketActionRateLimiter?: RateLimiter;
  socketConnectionRateLimiter?: RateLimiter;
  redisUrl?: string;
  roomCoordinator?: RoomCoordinator;
  roomStateStore?: RoomStateStore;
}): {
  io: Server<ClientToServerEvents, ServerToClientEvents>;
  stop: () => Promise<void>;
} {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(input.app.server, {
    cors: {
      origin: input.corsOrigins && input.corsOrigins.length > 0 ? input.corsOrigins : false
    }
  });
  type RedisClient = ReturnType<typeof createClient>;
  let redisClients: [RedisClient, RedisClient] | undefined;
  const redisReady = input.redisUrl
    ? (async () => {
        const pubClient = createClient({ url: input.redisUrl! });
        const subClient = pubClient.duplicate();
        pubClient.on("error", () => undefined);
        subClient.on("error", () => undefined);
        try {
          await Promise.all([pubClient.connect(), subClient.connect()]);
          redisClients = [pubClient, subClient];
          io.adapter(
            createAdapter(
              pubClient as Parameters<typeof createAdapter>[0],
              subClient as Parameters<typeof createAdapter>[1]
            )
          );
        } catch {
          await Promise.all([
            Promise.resolve(pubClient.disconnect()),
            Promise.resolve(subClient.disconnect())
          ]);
        }
      })()
    : Promise.resolve();
  const socketConnectionRateLimiter =
    input.socketConnectionRateLimiter ?? createUnlimitedRateLimiter();
  const socketActionRateLimiter = input.socketActionRateLimiter ?? createUnlimitedRateLimiter();
  const gameLobbyService = input.gameLobbyService ?? createGameLobbyService();
  const gameRoomService = input.gameRoomService ?? createGameRoomService();
  const roomCoordinator =
    input.roomCoordinator ??
    createRoomCoordinator(input.redisUrl ? { redisUrl: input.redisUrl } : {});
  const roomStateStore = input.roomStateStore ?? createRoomStateStore(input.redisUrl);
  const playerConnectionRegistry =
    input.playerConnectionRegistry ?? createPlayerConnectionRegistry();
  const activeSocketsByRoomId = new Map<string, Set<GameSocket>>();
  const scheduledBotTimeoutsByRoomId = new Map<string, TimeoutHandle>();
  const scheduledDisconnectsByRoomAndUser = new Map<string, TimeoutHandle>();
  const scheduledHumanTimeoutsByRoomId = new Map<string, TimeoutHandle>();
  const humanTurnDeadlinesByRoomId = new Map<string, string>();
  let stopping = false;

  const unsubscribeRoomUpdates = gameLobbyService.subscribeRoomUpdates((room) => {
    io.to(`lobby:${room.roomId}`).emit("lobby:room", { room });
  });

  io.use(async (socket, next) => {
    if (stopping) {
      next(new Error("Server is shutting down"));
      return;
    }
    const token =
      readSocketToken(socket.handshake.auth.token) ??
      readCookieToken(
        socket.handshake.headers.cookie,
        process.env.AUTH_COOKIE_NAME ?? "mahjong_session"
      );
    if (!token) {
      next(new Error("Unauthorized"));
      return;
    }

    const user = await input.authService.getCurrentUser(token);
    if (!user) {
      next(new Error("Unauthorized"));
      return;
    }

    // 按用户限制连接建立频率，缓解连接风暴。
    if (!socketConnectionRateLimiter.isAllowed(`connection:${user.id}`)) {
      next(new Error("Too many connections, try again later"));
      return;
    }

    socket.data = { user } as SocketData;
    next();
  });

  io.on("connection", (socket) => {
    const gameSocket = socket as GameSocket;
    const user = (gameSocket.data as SocketData).user;
    playerConnectionRegistry.connect(user.id);
    const socketRoomIds = new Set<string>();
    const lobbyRoomIds = new Set<string>();

    for (const key of scheduledDisconnectsByRoomAndUser.keys()) {
      if (key.endsWith(`:${user.id}`)) {
        cancelDisconnectGrace(scheduledDisconnectsByRoomAndUser, key);
      }
    }

    function trackRoomSocket(roomId: string): void {
      cancelDisconnectGrace(
        scheduledDisconnectsByRoomAndUser,
        getDisconnectGraceKey(roomId, user.id)
      );
      socketRoomIds.add(roomId);
      const roomSockets = activeSocketsByRoomId.get(roomId) ?? new Set<GameSocket>();
      roomSockets.add(gameSocket);
      activeSocketsByRoomId.set(roomId, roomSockets);
    }

    function scheduleRoomBots(roomId: string): void {
      scheduleBots({
        activeSocketsByRoomId,
        gameLobbyService,
        gameRoomService,
        roomStateStore,
        humanTurnDeadlinesByRoomId,
        isStopping: () => stopping,
        roomId,
        scheduledBotTimeoutsByRoomId,
        scheduledHumanTimeoutsByRoomId
      });
    }

    function untrackRoomSocket(roomId: string): void {
      socketRoomIds.delete(roomId);
      const roomSockets = activeSocketsByRoomId.get(roomId);
      if (!roomSockets) {
        return;
      }

      roomSockets.delete(gameSocket);
      if (roomSockets.size === 0) {
        activeSocketsByRoomId.delete(roomId);
      }
    }

    gameSocket.on("disconnect", () => {
      playerConnectionRegistry.disconnect(user.id);
      if (stopping) {
        return;
      }
      for (const roomId of socketRoomIds) {
        const roomSockets = activeSocketsByRoomId.get(roomId);
        if (roomSockets) {
          roomSockets.delete(gameSocket);
          if (roomSockets.size === 0) {
            activeSocketsByRoomId.delete(roomId);
          }
        }

        const stillConnected = [...(activeSocketsByRoomId.get(roomId) ?? [])].some(
          (candidate) => (candidate.data as SocketData).user.id === user.id
        );
        const room = gameRoomService.getRoomForUser(user, roomId);
        if (stillConnected || !room || room.state.phase === "ended") {
          continue;
        }

        const graceKey = getDisconnectGraceKey(roomId, user.id);
        scheduleDisconnectGrace({
          key: graceKey,
          onExpire: () => {
            const reconnected = [...(activeSocketsByRoomId.get(roomId) ?? [])].some(
              (candidate) => (candidate.data as SocketData).user.id === user.id
            );
            if (reconnected) {
              return;
            }

            const result = gameRoomService.leaveActiveGame(user, "disconnect");
            if ("error" in result) {
              return;
            }

            gameLobbyService.replacePlayerWithBot(user, result.room.lobbyRoomId ?? result.room.id);
            if (result.ended) {
              syncLobbyRoomEnd(gameLobbyService, result.room);
            }

            const latestSockets = activeSocketsByRoomId.get(result.room.id);
            if (latestSockets) {
              emitLatestRoomEventToSockets(result.room, latestSockets);
              emitRoomStateToSockets({
                gameRoomService,
                humanTurnDeadlinesByRoomId,
                roomId: result.room.id,
                sockets: latestSockets
              });
            }
            scheduleRoomBots(result.room.id);
          },
          pendingTimeouts: scheduledDisconnectsByRoomAndUser
        });
      }
    });

    gameSocket.on("lobby:watch", (payload) => {
      const accessError = getGameSocketAccessError(user, "lobby");
      if (accessError) {
        gameSocket.emit("game:error", { message: accessError });
        return;
      }

      const room = gameLobbyService.getCurrentRoom(user);
      if (!room || room.roomId !== payload.roomId) {
        gameSocket.emit("game:error", { message: "Lobby room not found" });
        return;
      }

      for (const roomId of lobbyRoomIds) {
        if (roomId !== room.roomId) {
          gameSocket.leave(`lobby:${roomId}`);
          lobbyRoomIds.delete(roomId);
        }
      }

      lobbyRoomIds.add(room.roomId);
      gameSocket.join(`lobby:${room.roomId}`);
      gameSocket.emit("lobby:room", { room });
    });

    gameSocket.on("game:join", (payload) => {
      const accessError = getGameSocketAccessError(user, "join");
      if (accessError) {
        gameSocket.emit("game:error", { message: accessError });
        return;
      }

      const room = payload.gameId
        ? gameRoomService.getRoomForUser(user, payload.gameId)
        : gameRoomService.getOrCreateQuickRoom(user);

      if (!room) {
        gameSocket.emit("game:error", { message: "Game room not found" });
        return;
      }

      trackRoomSocket(room.id);
      scheduleRoomBots(room.id);
      emitRoomState(gameSocket, gameRoomService, humanTurnDeadlinesByRoomId, room.id);
      emitLatestRoomEvent(gameSocket, room);
    });

    gameSocket.on("game:start", () => {
      const accessError = getGameSocketAccessError(user, "start");
      if (accessError) {
        gameSocket.emit("game:error", { message: accessError });
        return;
      }

      const activeRoom = gameRoomService.getRoomForUser(user);
      const room =
        getGameStartMode(Boolean(activeRoom && activeRoom.state.phase !== "ended")) ===
        "sync-active-room"
          ? activeRoom
          : gameRoomService.getOrCreateQuickRoom(user);

      if (!room) {
        gameSocket.emit("game:error", { message: "No active game room" });
        return;
      }

      trackRoomSocket(room.id);
      scheduleRoomBots(room.id);
      emitRoomState(gameSocket, gameRoomService, humanTurnDeadlinesByRoomId, room.id);
      emitLatestRoomEvent(gameSocket, room);
    });

    gameSocket.on("game:action", async (payload) => {
      const accessError = getGameSocketAccessError(user, "action");
      if (accessError) {
        gameSocket.emit("game:error", { message: accessError });
        return;
      }

      // 按用户限制游戏动作频率，缓解刷屏式操作。
      if (!socketActionRateLimiter.isAllowed(`action:${user.id}`)) {
        gameSocket.emit("game:error", { message: "Too many actions, slow down" });
        return;
      }

      const activeRoom = payload.gameId
        ? gameRoomService.getRoomForUser(user, payload.gameId)
        : gameRoomService.getRoomForUser(user);
      if (!activeRoom && payload.gameId) {
        const distributedSnapshot = await roomStateStore.get(payload.gameId);
        if (distributedSnapshot) gameRoomService.restoreSnapshot(distributedSnapshot);
        await gameRoomService.restoreRoom(payload.gameId);
      }
      const restoredRoom = payload.gameId
        ? gameRoomService.getRoomForUser(user, payload.gameId)
        : gameRoomService.getRoomForUser(user);
      const result = restoredRoom
        ? await roomCoordinator.runExclusive(restoredRoom.id, async () => {
            let actionResult = gameRoomService.applyHumanAction(
              user,
              payload.action,
              payload.stateVersion
            );
            if (actionResult?.error === "Stale game state, please sync and retry") {
              const latestSnapshot = await roomStateStore.get(restoredRoom.id);
              const latestVersion = latestSnapshot?.stateVersion;
              if (
                latestSnapshot &&
                latestVersion !== undefined &&
                latestVersion !== payload.stateVersion
              ) {
                gameRoomService.restoreSnapshot(latestSnapshot, true);
                actionResult = gameRoomService.applyHumanAction(
                  user,
                  payload.action,
                  latestVersion
                );
              }
            }
            return actionResult;
          })
        : null;
      if (!result) {
        gameSocket.emit("game:error", { message: "No active game room" });
        return;
      }

      if (result.error) {
        gameSocket.emit("game:error", { message: result.error });
        emitRoomState(gameSocket, gameRoomService, humanTurnDeadlinesByRoomId, result.room.id);
        return;
      }
      const updatedSnapshot = gameRoomService.getRecoverySnapshot(result.room.id);
      if (updatedSnapshot) await roomStateStore.set(updatedSnapshot);
      syncLobbyRoomEnd(gameLobbyService, result.room);

      const timeout = scheduledHumanTimeoutsByRoomId.get(result.room.id);
      if (timeout) {
        clearTimeout(timeout);
        scheduledHumanTimeoutsByRoomId.delete(result.room.id);
      }
      humanTurnDeadlinesByRoomId.delete(result.room.id);

      trackRoomSocket(result.room.id);
      scheduleRoomBots(result.room.id);
      const roomSockets = activeSocketsByRoomId.get(result.room.id);
      if (roomSockets) {
        emitRoomStateToSockets({
          gameRoomService,
          humanTurnDeadlinesByRoomId,
          roomId: result.room.id,
          sockets: roomSockets
        });
        emitLatestRoomEventToSockets(result.room, roomSockets);
      }
    });

    gameSocket.on("game:leave", () => {
      const accessError = getGameSocketAccessError(user, "leave");
      if (accessError) {
        gameSocket.emit("game:error", { message: accessError });
        return;
      }

      const result = gameRoomService.leaveActiveGame(user);
      if ("error" in result) {
        gameSocket.emit("game:error", { message: result.error });
        return;
      }

      cancelDisconnectGrace(
        scheduledDisconnectsByRoomAndUser,
        getDisconnectGraceKey(result.room.id, user.id)
      );

      gameLobbyService.replacePlayerWithBot(user, result.room.lobbyRoomId ?? result.room.id);
      if (result.ended) {
        syncLobbyRoomEnd(gameLobbyService, result.room);
      }

      untrackRoomSocket(result.room.id);
      gameSocket.emit("game:left", {
        mode: result.mode,
        roomId: result.room.id
      });

      const roomSockets = activeSocketsByRoomId.get(result.room.id);
      if (roomSockets) {
        emitLatestRoomEventToSockets(result.room, roomSockets);
        emitRoomStateToSockets({
          gameRoomService,
          humanTurnDeadlinesByRoomId,
          roomId: result.room.id,
          sockets: roomSockets
        });
      }
      scheduleRoomBots(result.room.id);
    });

    gameSocket.on("game:sync", async (payload) => {
      const accessError = getGameSocketAccessError(user, "sync");
      if (accessError) {
        gameSocket.emit("game:error", { message: accessError });
        return;
      }

      if (payload.gameId) {
        const distributedSnapshot = await roomStateStore.get(payload.gameId);
        if (distributedSnapshot) gameRoomService.restoreSnapshot(distributedSnapshot);
        await gameRoomService.restoreRoom(payload.gameId);
      }
      const room = gameRoomService.getRoomForUser(user, payload.gameId);
      if (!room) {
        gameSocket.emit("game:error", { message: "Game room not found" });
        return;
      }

      trackRoomSocket(room.id);
      scheduleRoomBots(room.id);
      emitRoomState(gameSocket, gameRoomService, humanTurnDeadlinesByRoomId, room.id);
      emitLatestRoomEvent(gameSocket, room);
    });
  });

  async function stop(): Promise<void> {
    if (stopping) {
      return;
    }
    stopping = true;
    unsubscribeRoomUpdates();

    for (const timeout of scheduledBotTimeoutsByRoomId.values()) {
      clearTimeout(timeout);
    }
    for (const timeout of scheduledHumanTimeoutsByRoomId.values()) {
      clearTimeout(timeout);
    }
    for (const timeout of scheduledDisconnectsByRoomAndUser.values()) {
      clearTimeout(timeout);
    }
    scheduledBotTimeoutsByRoomId.clear();
    scheduledHumanTimeoutsByRoomId.clear();
    scheduledDisconnectsByRoomAndUser.clear();
    humanTurnDeadlinesByRoomId.clear();

    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });
    await redisReady;
    if (redisClients) {
      await Promise.all(redisClients.map((client) => client.quit().catch(() => undefined)));
    }
    if (!input.roomCoordinator) await roomCoordinator.close();
    if (!input.roomStateStore) await roomStateStore.close();
  }

  return { io, stop };
}
