import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { resolve } from "node:path";

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
import {
  createSlidingWindowRateLimiter,
  createUnlimitedRateLimiter,
  type RateLimiter
} from "./security/rateLimiter.js";

export type CreateAppOptions = {
  authTokenSecret?: string;
  closeDatabase?: () => Promise<void>;
  databaseReadinessCheck?: () => Promise<void>;
  gameLobbyService?: GameLobbyService;
  gameRecordRepository?: GameRecordRepository;
  gameRoomService?: GameRoomService;
  loginRateLimiter?: RateLimiter;
  playerConnectionRegistry?: PlayerConnectionRegistry;
  persistenceDiagnosticRegistry?: PersistenceDiagnosticRegistry;
  socketActionRateLimiter?: RateLimiter;
  socketConnectionRateLimiter?: RateLimiter;
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
    bodyLimit: env.bodyLimitBytes,
    logger: true
  });
  const lifecycle = createServerLifecycle();
  const closeDatabase = options.closeDatabase ?? closePrisma;
  const databaseReadinessCheck = options.databaseReadinessCheck ?? checkPrismaConnection;
  const userRepository = options.userRepository ?? createPrismaUserRepository();
  const loginRateLimiter =
    options.loginRateLimiter ??
    (env.loginRateLimitMax > 0
      ? createSlidingWindowRateLimiter({
          maxRequests: env.loginRateLimitMax,
          windowMs: env.loginRateLimitWindowMs
        })
      : createUnlimitedRateLimiter());
  const socketConnectionRateLimiter =
    options.socketConnectionRateLimiter ??
    (env.socketConnectionRateLimitMax > 0
      ? createSlidingWindowRateLimiter({
          maxRequests: env.socketConnectionRateLimitMax,
          windowMs: env.socketConnectionRateLimitWindowMs
        })
      : createUnlimitedRateLimiter());
  const socketActionRateLimiter =
    options.socketActionRateLimiter ??
    (env.socketActionRateLimitMax > 0
      ? createSlidingWindowRateLimiter({
          maxRequests: env.socketActionRateLimitMax,
          windowMs: env.socketActionRateLimitWindowMs
        })
      : createUnlimitedRateLimiter());
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
  // 同源部署（vite proxy / nginx）默认不需要 CORS；配置 CORS_ORIGIN 时启用白名单。
  await app.register(cors, {
    origin: env.corsOrigins.length > 0 ? env.corsOrigins : false
  });
  await registerRoutes(app, {
    authService,
    databaseReadinessCheck,
    gameLobbyService,
    gameRecordRepository,
    gameRoomService,
    lifecycle,
    loginRateLimiter,
    playerConnectionRegistry,
    persistenceDiagnosticRegistry,
    userService
  });
  if (env.webDistDir) {
    await app.register(fastifyStatic, {
      index: false,
      root: resolve(env.webDistDir)
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET" && request.headers.accept?.includes("text/html")) {
        return reply.type("text/html").sendFile("index.html");
      }

      return reply.code(404).send({ message: "Route not found" });
    });
  }
  const gameSocketServer = registerGameSocketServer({
    app,
    authService,
    corsOrigins: env.corsOrigins,
    gameLobbyService,
    gameRoomService,
    playerConnectionRegistry,
    socketActionRateLimiter,
    socketConnectionRateLimiter
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
