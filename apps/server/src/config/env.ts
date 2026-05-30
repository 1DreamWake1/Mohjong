import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type ServerEnv = {
  authTokenSecret: string;
  host: string;
  port: number;
};

let envLoaded = false;

function findEnvPath(startDir: string): string | null {
  let currentDir = startDir;

  for (let depth = 0; depth < 6; depth += 1) {
    const envPath = resolve(currentDir, ".env");
    if (existsSync(envPath)) {
      return envPath;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  return null;
}

export function loadEnv(): void {
  if (envLoaded) {
    return;
  }

  const envPath = findEnvPath(process.cwd());
  if (envPath) {
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
