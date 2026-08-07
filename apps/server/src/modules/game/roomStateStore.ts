import { createClient } from "redis";

import type { GameRecoverySnapshot } from "./gameRecordRepository.js";

type RedisClient = ReturnType<typeof createClient>;

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
    connectPromise ??= (async () => {
      const nextClient = createClient({ url: redisUrl });
      nextClient.on("error", () => undefined);
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
        return JSON.parse(value) as GameRecoverySnapshot;
      } catch {
        return undefined;
      }
    },
    async set(snapshot) {
      const redis = await getClient();
      if (!redis) return;
      const current = await redis.get(key(snapshot.roomId)).catch(() => null);
      if (current) {
        try {
          const currentSnapshot = JSON.parse(current) as GameRecoverySnapshot;
          if ((currentSnapshot.stateVersion ?? 0) > (snapshot.stateVersion ?? 0)) return;
        } catch {
          // Replace malformed state with the next valid snapshot.
        }
      }
      await redis.set(key(snapshot.roomId), JSON.stringify(snapshot)).catch(() => undefined);
    }
  };
}
