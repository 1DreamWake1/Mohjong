import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type ServerEnv = {
  authTokenSecret: string;
  bodyLimitBytes: number;
  corsOrigins: string[];
  host: string;
  loginRateLimitMax: number;
  loginRateLimitWindowMs: number;
  port: number;
  redisUrl: string | undefined;
  shutdownTimeoutMs: number;
  socketActionRateLimitMax: number;
  socketActionRateLimitWindowMs: number;
  socketConnectionRateLimitMax: number;
  socketConnectionRateLimitWindowMs: number;
  webDistDir: string | undefined;
};

let envLoaded = false;

const DEV_AUTH_TOKEN_SECRET = "development-only-secret-change-me";

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

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN;
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * 生产环境配置校验：缺失或不合规的密钥、数据库路径直接拒绝启动。
 * 开发环境保留宽松默认值，便于本地运行和测试注入。
 */
export function readEnv(): ServerEnv {
  loadEnv();

  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    const secret = process.env.AUTH_TOKEN_SECRET ?? "";
    if (secret.length < 32) {
      throw new Error("AUTH_TOKEN_SECRET must be at least 32 characters long in production");
    }

    const databaseUrl = process.env.DATABASE_URL ?? "";
    if (
      !databaseUrl.startsWith("file:/") &&
      !databaseUrl.startsWith("postgres://") &&
      !databaseUrl.startsWith("postgresql://")
    ) {
      throw new Error(
        "DATABASE_URL must be an absolute file: path or PostgreSQL URL in production"
      );
    }
  }

  return {
    authTokenSecret: process.env.AUTH_TOKEN_SECRET ?? DEV_AUTH_TOKEN_SECRET,
    bodyLimitBytes: readNumber("BODY_LIMIT_BYTES", 64 * 1024),
    corsOrigins: readCorsOrigins(),
    host: process.env.HOST ?? "0.0.0.0",
    loginRateLimitMax: readNumber("LOGIN_RATE_LIMIT_MAX", 10),
    loginRateLimitWindowMs: readNumber("LOGIN_RATE_LIMIT_WINDOW_MS", 60_000),
    port: readNumber("PORT", 3000),
    redisUrl: process.env.REDIS_URL?.trim() || undefined,
    shutdownTimeoutMs: readNumber("SHUTDOWN_TIMEOUT_MS", 10_000),
    socketActionRateLimitMax: readNumber("SOCKET_ACTION_RATE_LIMIT_MAX", 30),
    socketActionRateLimitWindowMs: readNumber("SOCKET_ACTION_RATE_LIMIT_WINDOW_MS", 10_000),
    socketConnectionRateLimitMax: readNumber("SOCKET_CONNECTION_RATE_LIMIT_MAX", 20),
    socketConnectionRateLimitWindowMs: readNumber("SOCKET_CONNECTION_RATE_LIMIT_WINDOW_MS", 60_000),
    webDistDir: process.env.WEB_DIST_DIR?.trim() || undefined
  };
}
