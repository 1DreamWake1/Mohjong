import cors from "@fastify/cors";
import Fastify from "fastify";

import { registerRoutes } from "./http/routes.js";

export async function createApp() {
  const app = Fastify({
    logger: true
  });

  await app.register(cors, {
    origin: true
  });
  await registerRoutes(app);

  return app;
}
