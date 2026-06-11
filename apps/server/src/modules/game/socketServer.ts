import type { AuthUser, ClientToServerEvents, ServerToClientEvents } from "@mahjong/shared";
import type { FastifyInstance } from "fastify";
import { Server, type Socket } from "socket.io";

import type { AuthService } from "../auth/authService.js";
import { createGameLobbyService, type GameLobbyService } from "./gameLobbyService.js";
import { createGameRoomService, type GameRoomService } from "./gameRoomService.js";

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

type SocketData = {
  user: AuthUser;
};

type GameSocketOperation = "action" | "join" | "lobby" | "start" | "sync";
type TimeoutHandle = ReturnType<typeof setTimeout>;

const playerOnlyErrors: Record<GameSocketOperation, string> = {
  action: "Only players can act in games",
  join: "Only players can join games",
  lobby: "Only players can watch lobby rooms",
  start: "Only players can start games",
  sync: "Only players can sync games"
};

export function readSocketToken(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function getGameSocketAccessError(user: AuthUser, operation: GameSocketOperation): string | null {
  return user.role === "player" ? null : playerOnlyErrors[operation];
}

export const humanActionTimeoutMs = 30_000;

export function getGameStartMode(hasActiveRoom: boolean): "create-quick-room" | "sync-active-room" {
  return hasActiveRoom ? "sync-active-room" : "create-quick-room";
}

function emitRoomState(socket: GameSocket, gameRoomService: GameRoomService, roomId?: string): void {
  const user = (socket.data as SocketData).user;
  const room = gameRoomService.getRoomForUser(user, roomId);
  if (!room) {
    socket.emit("game:error", { message: "No active game room" });
    return;
  }

  socket.emit("game:state", { view: gameRoomService.getPlayerView(room) });
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

function scheduleBots(input: {
  activeSocketByRoomId: Map<string, GameSocket>;
  gameRoomService: GameRoomService;
  roomId: string;
  scheduledBotRoomIds: Set<string>;
  scheduledHumanTimeoutsByRoomId: Map<string, TimeoutHandle>;
  user: AuthUser;
}): void {
  const room = input.gameRoomService.getRoomForUser(input.user, input.roomId);
  if (!room || room.state.phase !== "playing") {
    return;
  }

  const player = room.state.players[room.state.currentTurn];
  if (!player?.isBot) {
    const latestSocket = input.activeSocketByRoomId.get(input.roomId);
    if (latestSocket) {
      emitRoomState(latestSocket, input.gameRoomService, input.roomId);
    }
    scheduleHumanTimeout(input);
    return;
  }

  if (input.scheduledBotRoomIds.has(room.id)) {
    return;
  }

  input.scheduledBotRoomIds.add(room.id);
  const delayMs = 500 + Math.floor(Math.random() * 1500);
  setTimeout(() => {
    input.scheduledBotRoomIds.delete(input.roomId);
    const latestRoom = input.gameRoomService.getRoomForUser(input.user, input.roomId);
    if (!latestRoom) {
      return;
    }

    const latestSocket = input.activeSocketByRoomId.get(input.roomId);
    if (latestRoom.state.phase !== "playing") {
      if (latestSocket) {
        emitRoomState(latestSocket, input.gameRoomService, input.roomId);
      }
      return;
    }

    const latestPlayer = latestRoom.state.players[latestRoom.state.currentTurn];
    if (!latestPlayer?.isBot) {
      if (latestSocket) {
        emitRoomState(latestSocket, input.gameRoomService, input.roomId);
      }
      return;
    }

    if (latestSocket) {
      input.gameRoomService.applyNextBotAction(latestRoom);
      emitLatestRoomEvent(latestSocket, latestRoom);
      emitRoomState(latestSocket, input.gameRoomService, input.roomId);
    } else {
      input.gameRoomService.applyNextBotAction(latestRoom);
    }
    scheduleBots(input);
  }, delayMs);
}

function scheduleHumanTimeout(input: {
  activeSocketByRoomId: Map<string, GameSocket>;
  gameRoomService: GameRoomService;
  roomId: string;
  scheduledBotRoomIds: Set<string>;
  scheduledHumanTimeoutsByRoomId: Map<string, TimeoutHandle>;
  user: AuthUser;
}): void {
  const room = input.gameRoomService.getRoomForUser(input.user, input.roomId);
  if (!room || room.state.phase !== "playing") {
    return;
  }

  const player = room.state.players[room.state.currentTurn];
  if (player?.isBot || room.state.currentTurn !== room.humanSeatIndex) {
    return;
  }

  if (input.scheduledHumanTimeoutsByRoomId.has(room.id)) {
    return;
  }

  const scheduledState = room.state;
  const timeout = setTimeout(() => {
    input.scheduledHumanTimeoutsByRoomId.delete(input.roomId);
    const latestRoom = input.gameRoomService.getRoomForUser(input.user, input.roomId);
    if (!latestRoom || latestRoom.state !== scheduledState) {
      return;
    }

    const latestSocket = input.activeSocketByRoomId.get(input.roomId);
    if (!input.gameRoomService.applyHumanTimeout(latestRoom)) {
      return;
    }

    if (latestSocket) {
      latestSocket.emit("game:timeout", { message: "操作超时，已自动托管出牌" });
      emitLatestRoomEvent(latestSocket, latestRoom);
      emitRoomState(latestSocket, input.gameRoomService, input.roomId);
    }
    scheduleBots(input);
  }, humanActionTimeoutMs);

  input.scheduledHumanTimeoutsByRoomId.set(room.id, timeout);
}

export function registerGameSocketServer(input: {
  app: FastifyInstance;
  authService: AuthService;
  gameLobbyService?: GameLobbyService;
  gameRoomService?: GameRoomService;
}): Server<ClientToServerEvents, ServerToClientEvents> {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(input.app.server, {
    cors: {
      origin: true
    }
  });
  const gameLobbyService = input.gameLobbyService ?? createGameLobbyService();
  const gameRoomService = input.gameRoomService ?? createGameRoomService();
  const activeSocketByRoomId = new Map<string, GameSocket>();
  const scheduledBotRoomIds = new Set<string>();
  const scheduledHumanTimeoutsByRoomId = new Map<string, TimeoutHandle>();

  gameLobbyService.subscribeRoomUpdates((room) => {
    io.to(`lobby:${room.roomId}`).emit("lobby:room", { room });
  });

  io.use(async (socket, next) => {
    const token = readSocketToken(socket.handshake.auth.token);
    if (!token) {
      next(new Error("Unauthorized"));
      return;
    }

    const user = await input.authService.getCurrentUser(token);
    if (!user) {
      next(new Error("Unauthorized"));
      return;
    }

    socket.data = { user } as SocketData;
    next();
  });

  io.on("connection", (socket) => {
    const gameSocket = socket as GameSocket;
    const user = (gameSocket.data as SocketData).user;
    const socketRoomIds = new Set<string>();
    const lobbyRoomIds = new Set<string>();

    function trackRoomSocket(roomId: string): void {
      socketRoomIds.add(roomId);
      activeSocketByRoomId.set(roomId, gameSocket);
    }

    function scheduleRoomBots(roomId: string): void {
      scheduleBots({
        activeSocketByRoomId,
        gameRoomService,
        roomId,
        scheduledBotRoomIds,
        scheduledHumanTimeoutsByRoomId,
        user
      });
    }

    gameSocket.on("disconnect", () => {
      for (const roomId of socketRoomIds) {
        if (activeSocketByRoomId.get(roomId) === gameSocket) {
          activeSocketByRoomId.delete(roomId);
        }
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
      gameSocket.emit("game:state", { view: gameRoomService.getPlayerView(room) });
      emitLatestRoomEvent(gameSocket, room);
      scheduleRoomBots(room.id);
    });

    gameSocket.on("game:start", () => {
      const accessError = getGameSocketAccessError(user, "start");
      if (accessError) {
        gameSocket.emit("game:error", { message: accessError });
        return;
      }

      const activeRoom = gameRoomService.getRoomForUser(user);
      const room =
        getGameStartMode(Boolean(activeRoom)) === "sync-active-room"
          ? activeRoom
          : gameRoomService.getOrCreateQuickRoom(user);

      if (!room) {
        gameSocket.emit("game:error", { message: "No active game room" });
        return;
      }

      trackRoomSocket(room.id);
      gameSocket.emit("game:state", { view: gameRoomService.getPlayerView(room) });
      emitLatestRoomEvent(gameSocket, room);
      scheduleRoomBots(room.id);
    });

    gameSocket.on("game:action", (payload) => {
      const accessError = getGameSocketAccessError(user, "action");
      if (accessError) {
        gameSocket.emit("game:error", { message: accessError });
        return;
      }

      const result = gameRoomService.applyHumanAction(user, payload.action);
      if (!result) {
        gameSocket.emit("game:error", { message: "No active game room" });
        return;
      }

      if (result.error) {
        gameSocket.emit("game:error", { message: result.error });
        gameSocket.emit("game:state", { view: gameRoomService.getPlayerView(result.room) });
        return;
      }
      const timeout = scheduledHumanTimeoutsByRoomId.get(result.room.id);
      if (timeout) {
        clearTimeout(timeout);
        scheduledHumanTimeoutsByRoomId.delete(result.room.id);
      }

      gameSocket.emit("game:state", { view: gameRoomService.getPlayerView(result.room) });
      emitLatestRoomEvent(gameSocket, result.room);
      trackRoomSocket(result.room.id);
      scheduleRoomBots(result.room.id);
    });

    gameSocket.on("game:sync", (payload) => {
      const accessError = getGameSocketAccessError(user, "sync");
      if (accessError) {
        gameSocket.emit("game:error", { message: accessError });
        return;
      }

      const room = gameRoomService.getRoomForUser(user, payload.gameId);
      if (!room) {
        gameSocket.emit("game:error", { message: "Game room not found" });
        return;
      }

      trackRoomSocket(room.id);
      gameSocket.emit("game:state", { view: gameRoomService.getPlayerView(room) });
      emitLatestRoomEvent(gameSocket, room);
      scheduleRoomBots(room.id);
    });
  });

  return io;
}
