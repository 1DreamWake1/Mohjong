import { createApp } from "./app.js";
import { readEnv } from "./config/env.js";

const env = readEnv();
const app = await createApp();

await app.listen({
  host: env.host,
  port: env.port
});
