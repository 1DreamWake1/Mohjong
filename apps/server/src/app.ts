import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";

import { readEnv } from "./config/env.js";
import { checkPrismaConnection, closePrisma } from "./db/prisma.js";
import { registerRoutes } from "./http/routes.js";
import { createServerLifecycle, type ServerLifecycle } from "./lifecycle/serverLifecycle.js";
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
  closeDatabase?: () => Promise<void>;
  databaseReadinessCheck?: () => Promise<void>;
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

export async function createApp(
  options: CreateAppOptions = {}
): Promise<FastifyInstance & { lifecycle: ServerLifecycle }> {
  const env = readEnv();
  const app = Fastify({
    logger: true
  });
  const lifecycle = createServerLifecycle();
  const closeDatabase = options.closeDatabase ?? closePrisma;
  const databaseReadinessCheck = options.databaseReadinessCheck ?? checkPrismaConnection;
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

  app.log.info("Restoring active Mahjong rooms");
  const restoredGames = await gameRoomService.restoreActiveRooms();
  for (const snapshot of restoredGames) {
    gameLobbyService.restorePlayingRoom(snapshot);
  }
  app.log.info(
    { restoredRoomCount: restoredGames.length },
    "Active Mahjong room restoration completed"
  );

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
  await app.register(cors, {
    origin: true
  });
  await registerRoutes(app, {
    authService,
    databaseReadinessCheck,
    gameLobbyService,
    gameRecordRepository,
    gameRoomService,
    playerConnectionRegistry,
    persistenceDiagnosticRegistry,
    userService,
    lifecycle
  });
  const gameSocketServer = registerGameSocketServer({
    app,
    authService,
    gameLobbyService,
    gameRoomService,
    playerConnectionRegistry
  });

  app.addHook("onClose", async () => {
    lifecycle.beginShutdown();
    clearInterval(cleanupTimer);
    app.log.info("Stopping Mahjong timers and Socket.IO connections");
    await gameSocketServer.stop();
    app.log.info("Waiting for queued Mahjong persistence writes");
    await gameRoomService.waitForPersistentWrites();
    await closeDatabase();
    app.log.info("Mahjong server resources closed");
  });

  lifecycle.markReady();
  app.log.info("Mahjong server is ready");

  return Object.assign(app, { lifecycle }) as FastifyInstance & {
    lifecycle: ServerLifecycle;
  };
}
