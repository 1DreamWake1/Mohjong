import type { AuthUser, ClientToServerEvents, ServerToClientEvents } from "@mahjong/shared";
import type { FastifyInstance } from "fastify";
import { Server, type Socket } from "socket.io";

import type { AuthService } from "../auth/authService.js";
import { createGameRoomService, type GameRoomService } from "./gameRoomService.js";

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

type SocketData = {
  user: AuthUser;
};

function readToken(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function emitRoomState(socket: GameSocket, gameRoomService: GameRoomService): void {
  const user = (socket.data as SocketData).user;
  const room = gameRoomService.getRoomForUser(user);
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
  gameRoomService: GameRoomService;
  roomId: string;
  socket: GameSocket;
}): void {
  const room = input.gameRoomService.getRoomForUser((input.socket.data as SocketData).user, input.roomId);
  if (!room || room.state.phase !== "playing") {
    return;
  }

  const player = room.state.players[room.state.currentTurn];
  if (!player?.isBot) {
    emitRoomState(input.socket, input.gameRoomService);
    return;
  }

  const delayMs = 500 + Math.floor(Math.random() * 1500);
  setTimeout(() => {
    const latestRoom = input.gameRoomService.getRoomForUser(
      (input.socket.data as SocketData).user,
      input.roomId
    );
    if (!latestRoom) {
      return;
    }

    input.gameRoomService.applyNextBotAction(latestRoom);
    emitRoomState(input.socket, input.gameRoomService);
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

  io.use(async (socket, next) => {
    const token = readToken(socket.handshake.auth.token);
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

    gameSocket.on("game:join", (payload) => {
      if (user.role !== "player") {
        gameSocket.emit("game:error", { message: "Only players can join games" });
        return;
      }

      const room = payload.gameId
        ? gameRoomService.getRoomForUser(user, payload.gameId)
        : gameRoomService.getOrCreateQuickRoom(user);

      if (!room) {
        gameSocket.emit("game:error", { message: "Game room not found" });
        return;
      }

      gameSocket.emit("game:state", { view: gameRoomService.getPlayerView(room) });
      scheduleBots({ gameRoomService, roomId: room.id, socket: gameSocket });
    });

    gameSocket.on("game:start", () => {
      gameSocket.emit("game:event", { message: "快速对局已自动开始" });
      emitRoomState(gameSocket, gameRoomService);
    });

    gameSocket.on("game:action", (payload) => {
      if (user.role !== "player") {
        gameSocket.emit("game:error", { message: "Only players can act in games" });
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
      scheduleBots({ gameRoomService, roomId: result.room.id, socket: gameSocket });
    });

    gameSocket.on("game:sync", (payload) => {
      const room = gameRoomService.getRoomForUser(user, payload.gameId);
      if (!room) {
        gameSocket.emit("game:error", { message: "Game room not found" });
        return;
      }

      gameSocket.emit("game:state", { view: gameRoomService.getPlayerView(room) });
      scheduleBots({ gameRoomService, roomId: room.id, socket: gameSocket });
    });
  });

  return io;
}
