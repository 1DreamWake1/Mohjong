import cors from "@fastify/cors";
import Fastify from "fastify";

import { readEnv } from "./config/env.js";
import { registerRoutes } from "./http/routes.js";
import { createAuthService } from "./modules/auth/authService.js";
import {
  createPrismaGameRecordRepository,
  type GameRecordRepository
} from "./modules/game/gameRecordRepository.js";
import {
  createGameRoomService,
  type GameRoomService
} from "./modules/game/gameRoomService.js";
import {
  createGameLobbyService,
  type GameLobbyService
} from "./modules/game/gameLobbyService.js";
import { registerGameSocketServer } from "./modules/game/socketServer.js";
import { createPrismaUserRepository } from "./modules/users/userRepository.js";
import type { UserRepository } from "./modules/users/userRepository.js";
import { createUserService } from "./modules/users/userService.js";

export type CreateAppOptions = {
  authTokenSecret?: string;
  gameLobbyService?: GameLobbyService;
  gameRecordRepository?: GameRecordRepository;
  gameRoomService?: GameRoomService;
  userRepository?: UserRepository;
};

export async function createApp(options: CreateAppOptions = {}) {
  const env = readEnv();
  const userRepository = options.userRepository ?? createPrismaUserRepository();
  const authService = createAuthService(
    userRepository,
    options.authTokenSecret ?? env.authTokenSecret
  );
  const userService = createUserService(userRepository);
  const gameRecordRepository =
    options.gameRecordRepository ?? createPrismaGameRecordRepository();
  const gameLobbyService = options.gameLobbyService ?? createGameLobbyService();
  const gameRoomService =
    options.gameRoomService ??
    createGameRoomService({
      gameRecordRepository
    });

  const app = Fastify({
    logger: true
  });

  await app.register(cors, {
    origin: true
  });
  await registerRoutes(app, {
    authService,
    gameLobbyService,
    gameRecordRepository,
    userService
  });
  registerGameSocketServer({
    app,
    authService,
    gameLobbyService,
    gameRoomService
  });

  return app;
}
