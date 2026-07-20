import cors from "@fastify/cors";
import Fastify from "fastify";

import { readEnv } from "./config/env.js";
import { registerRoutes } from "./http/routes.js";
import { createAuthService } from "./modules/auth/authService.js";
import {
  createPrismaGameRecordRepository,
  type GameRecordRepository
} from "./modules/game/gameRecordRepository.js";
import { createGameRoomService, type GameRoomService } from "./modules/game/gameRoomService.js";
import { createGameLobbyService, type GameLobbyService } from "./modules/game/gameLobbyService.js";
import { registerGameSocketServer } from "./modules/game/socketServer.js";
import {
  createPlayerConnectionRegistry,
  type PlayerConnectionRegistry
} from "./modules/game/playerConnectionRegistry.js";
import {
  createPersistenceDiagnosticRegistry,
  type PersistenceDiagnosticRegistry
} from "./modules/game/persistenceDiagnosticRegistry.js";
import { createPrismaUserRepository } from "./modules/users/userRepository.js";
import type { UserRepository } from "./modules/users/userRepository.js";
import { createUserService } from "./modules/users/userService.js";

export type CreateAppOptions = {
  authTokenSecret?: string;
  gameLobbyService?: GameLobbyService;
  gameRecordRepository?: GameRecordRepository;
  gameRoomService?: GameRoomService;
  playerConnectionRegistry?: PlayerConnectionRegistry;
  persistenceDiagnosticRegistry?: PersistenceDiagnosticRegistry;
  userRepository?: UserRepository;
};

export const waitingRoomTtlMs = 2 * 60 * 60 * 1000;
export const endedRoomTtlMs = 30 * 60 * 1000;
export const roomCleanupIntervalMs = 5 * 60 * 1000;

export async function createApp(options: CreateAppOptions = {}) {
  const env = readEnv();
  const app = Fastify({
    logger: true
  });
  const userRepository = options.userRepository ?? createPrismaUserRepository();
  const authService = createAuthService(
    userRepository,
    options.authTokenSecret ?? env.authTokenSecret
  );
  const userService = createUserService(userRepository);
  const gameRecordRepository = options.gameRecordRepository ?? createPrismaGameRecordRepository();
  const gameLobbyService = options.gameLobbyService ?? createGameLobbyService();
  const persistenceDiagnosticRegistry =
    options.persistenceDiagnosticRegistry ?? createPersistenceDiagnosticRegistry();
  const gameRoomService =
    options.gameRoomService ??
    createGameRoomService({
      gameRecordRepository,
      onPersistenceError: ({ error, operation, roomId }) => {
        persistenceDiagnosticRegistry.record({ error, operation, roomId });
        app.log.error(
          { err: error, operation, roomId },
          "Mahjong game persistence operation failed"
        );
      }
    });
  const playerConnectionRegistry =
    options.playerConnectionRegistry ?? createPlayerConnectionRegistry();

  const restoredGames = await gameRoomService.restoreActiveRooms();
  for (const snapshot of restoredGames) {
    gameLobbyService.restorePlayingRoom(snapshot);
  }

  const cleanupTimer = setInterval(() => {
    const removedLobbyRoomIds = gameLobbyService.cleanupExpiredRooms({
      endedRoomTtlMs,
      waitingRoomTtlMs
    });
    const removedGameRoomIds = gameRoomService.cleanupExpiredRooms({ endedRoomTtlMs });
    if (removedLobbyRoomIds.length > 0 || removedGameRoomIds.length > 0) {
      app.log.info({ removedGameRoomIds, removedLobbyRoomIds }, "Cleaned up expired Mahjong rooms");
    }
  }, roomCleanupIntervalMs);
  cleanupTimer.unref();
  app.addHook("onClose", async () => {
    clearInterval(cleanupTimer);
  });

  await app.register(cors, {
    origin: true
  });
  await registerRoutes(app, {
    authService,
    gameLobbyService,
    gameRecordRepository,
    gameRoomService,
    playerConnectionRegistry,
    persistenceDiagnosticRegistry,
    userService
  });
  registerGameSocketServer({
    app,
    authService,
    gameLobbyService,
    gameRoomService,
    playerConnectionRegistry
  });

  return app;
}
