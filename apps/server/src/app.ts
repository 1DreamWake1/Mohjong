import cors from "@fastify/cors";
import Fastify from "fastify";

import { readEnv } from "./config/env.js";
import { registerRoutes } from "./http/routes.js";
import { createAuthService } from "./modules/auth/authService.js";
import { createPrismaUserRepository } from "./modules/users/userRepository.js";
import type { UserRepository } from "./modules/users/userRepository.js";
import { createUserService } from "./modules/users/userService.js";

export type CreateAppOptions = {
  authTokenSecret?: string;
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

  const app = Fastify({
    logger: true
  });

  await app.register(cors, {
    origin: true
  });
  await registerRoutes(app, {
    authService,
    userService
  });

  return app;
}
