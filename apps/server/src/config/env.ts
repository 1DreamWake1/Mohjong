import { existsSync } from "node:fs";
import { resolve } from "node:path";

export type ServerEnv = {
  authTokenSecret: string;
  host: string;
  port: number;
};

let envLoaded = false;

export function loadEnv(): void {
  if (envLoaded) {
    return;
  }

  const envPath = resolve(process.cwd(), ".env");
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }

  process.env.DATABASE_URL ??= "file:../data/dev.db";
  envLoaded = true;
}

export function readEnv(): ServerEnv {
  loadEnv();

  return {
    authTokenSecret: process.env.AUTH_TOKEN_SECRET ?? "local-development-secret",
    host: process.env.HOST ?? "0.0.0.0",
    port: Number(process.env.PORT ?? 3000)
  };
}
