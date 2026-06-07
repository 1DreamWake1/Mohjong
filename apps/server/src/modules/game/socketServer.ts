import type { AuthUser, ClientToServerEvents, ServerToClientEvents } from "@mahjong/shared";
import type { FastifyInstance } from "fastify";
import { Server, type Socket } from "socket.io";

import type { AuthService } from "../auth/authService.js";
import { createGameRoomService, type GameRoomService } from "./gameRoomService.js";

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

type SocketData = {
  user: AuthUser;
};

type GameSocketOperation = "action" | "join" | "start" | "sync";

const playerOnlyErrors: Record<GameSocketOperation, string> = {
  action: "Only players can act in games",
  join: "Only players can join games",
  start: "Only players can start games",
  sync: "Only players can sync games"
};

export function readSocketToken(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function getGameSocketAccessError(user: AuthUser, operation: GameSocketOperation): string | null {
  return user.role === "player" ? null : playerOnlyErrors[operation];
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

function scheduleBots(input: {
  activeSocketByRoomId: Map<string, GameSocket>;
  gameRoomService: GameRoomService;
  roomId: string;
  scheduledBotRoomIds: Set<string>;
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

    input.gameRoomService.applyNextBotAction(latestRoom);
    if (latestSocket) {
      emitRoomState(latestSocket, input.gameRoomService, input.roomId);
    }
    scheduleBots(input);
  }, delayMs);
}

export function registerGameSocketServer(input: {
  app: FastifyInstance;
  authService: AuthService;
  gameRoomService?: GameRoomService;
}): Server<ClientToServerEvents, ServerToClientEvents> {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(input.app.server, {
    cors: {
      origin: true
    }
  });
  const gameRoomService = input.gameRoomService ?? createGameRoomService();
  const activeSocketByRoomId = new Map<string, GameSocket>();
  const scheduledBotRoomIds = new Set<string>();

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
      scheduleRoomBots(room.id);
    });

    gameSocket.on("game:start", () => {
      const accessError = getGameSocketAccessError(user, "start");
      if (accessError) {
        gameSocket.emit("game:error", { message: accessError });
        return;
      }

      emitRoomState(gameSocket, gameRoomService);
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

      gameSocket.emit("game:state", { view: gameRoomService.getPlayerView(result.room) });
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
      scheduleRoomBots(room.id);
    });
  });

  return io;
}
