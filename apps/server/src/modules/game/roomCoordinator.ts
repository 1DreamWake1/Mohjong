import { randomUUID } from "node:crypto";

import { createClient } from "redis";

export type RoomCoordinator = {
  close(): Promise<void>;
  runExclusive<T>(roomId: string, task: () => Promise<T>): Promise<T>;
};

type RedisClient = ReturnType<typeof createClient>;

const releaseLockScript = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0`;

export function createRoomCoordinator(
  options: {
    redisUrl?: string;
    lockTtlMs?: number;
  } = {}
): RoomCoordinator {
  const localTails = new Map<string, Promise<void>>();
  const lockTtlMs = options.lockTtlMs ?? 10_000;
  let redis: RedisClient | undefined;
  let redisConnectPromise: Promise<RedisClient | undefined> | undefined;

  async function getRedis(): Promise<RedisClient | undefined> {
    if (!options.redisUrl) return undefined;
    if (redis?.isReady) return redis;
    redisConnectPromise ??= (async () => {
      const client = createClient({ url: options.redisUrl! });
      client.on("error", () => undefined);
      try {
        await client.connect();
        redis = client;
        return client;
      } catch {
        client.disconnect();
        return undefined;
      }
    })();
    return redisConnectPromise;
  }

  async function runExclusive<T>(roomId: string, task: () => Promise<T>): Promise<T> {
    const previous = localTails.get(roomId) ?? Promise.resolve();
    let releaseLocal!: () => void;
    const current = new Promise<void>((resolve) => {
      releaseLocal = resolve;
    });
    const tail = previous.then(() => current);
    localTails.set(roomId, tail);
    await previous;

    const client = await getRedis();
    const token = randomUUID();
    const key = `mahjong:room-lock:${roomId}`;
    let acquiredRedis = false;
    try {
      if (client) {
        const deadline = Date.now() + lockTtlMs;
        while (Date.now() < deadline) {
          acquiredRedis = (await client.set(key, token, { NX: true, PX: lockTtlMs })) === "OK";
          if (acquiredRedis) break;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        if (!acquiredRedis) throw new Error(`Timed out acquiring room lock: ${roomId}`);
      }
      return await task();
    } finally {
      if (client && acquiredRedis) {
        await client
          .eval(releaseLockScript, { keys: [key], arguments: [token] })
          .catch(() => undefined);
      }
      releaseLocal();
      if (localTails.get(roomId) === tail) localTails.delete(roomId);
    }
  }

  return {
    close: async () => {
      if (redis) await redis.quit().catch(() => undefined);
      redis = undefined;
    },
    runExclusive
  };
}
