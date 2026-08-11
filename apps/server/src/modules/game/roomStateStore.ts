import { createClient } from "redis";

import type { GameRecoverySnapshot } from "./gameRecordRepository.js";

type RedisClient = ReturnType<typeof createClient>;

const setSnapshotIfNewerScript = `
local current = redis.call("get", KEYS[1])
if current then
  local decoded = cjson.decode(current)
  local currentVersion = tonumber(decoded.stateVersion or 0)
  if currentVersion > tonumber(ARGV[1]) then return 0 end
end
redis.call("set", KEYS[1], ARGV[2])
return 1`;

export type RoomStateStore = {
  close(): Promise<void>;
  get(roomId: string): Promise<GameRecoverySnapshot | undefined>;
  set(snapshot: GameRecoverySnapshot): Promise<void>;
};

export function createRoomStateStore(redisUrl?: string): RoomStateStore {
  let client: RedisClient | undefined;
  let connectPromise: Promise<RedisClient | undefined> | undefined;

  async function getClient(): Promise<RedisClient | undefined> {
    if (!redisUrl) return undefined;
    if (client?.isReady) return client;
    if (client && !client.isReady) {
      client = undefined;
      connectPromise = undefined;
    }
    connectPromise ??= (async () => {
      const nextClient = createClient({ url: redisUrl });
      nextClient.on("error", () => undefined);
      nextClient.on("end", () => {
        if (client === nextClient) client = undefined;
        connectPromise = undefined;
      });
      try {
        await nextClient.connect();
        client = nextClient;
        return nextClient;
      } catch {
        nextClient.disconnect();
        connectPromise = undefined;
        return undefined;
      }
    })();
    return connectPromise;
  }

  function key(roomId: string): string {
    return `mahjong:room-state:${roomId}`;
  }

  return {
    async close() {
      if (client) await client.quit().catch(() => undefined);
      client = undefined;
      connectPromise = undefined;
    },
    async get(roomId) {
      const redis = await getClient();
      if (!redis) return undefined;
      const value = await redis.get(key(roomId)).catch(() => null);
      if (!value) return undefined;
      try {
        const snapshot = JSON.parse(value) as Partial<GameRecoverySnapshot>;
        if (snapshot.roomId !== roomId || !snapshot.state || snapshot.version !== 1) {
          return undefined;
        }
        return snapshot as GameRecoverySnapshot;
      } catch {
        return undefined;
      }
    },
    async set(snapshot) {
      const redis = await getClient();
      if (!redis) return;
      await redis
        .eval(setSnapshotIfNewerScript, {
          keys: [key(snapshot.roomId)],
          arguments: [String(snapshot.stateVersion ?? 0), JSON.stringify(snapshot)]
        })
        .catch(() => undefined);
    }
  };
}
