import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createInitialGame, simpleRuleConfig } from "mahjong-core";

import { createRoomCoordinator } from "./roomCoordinator.js";
import { createRoomStateStore } from "./roomStateStore.js";
import type { GameRecoverySnapshot } from "./gameRecordRepository.js";

const redisUrl = process.env.REDIS_URL;
const integration = process.env.PHASE23_INTEGRATION === "1" && Boolean(redisUrl);
const redisConnectionUrl = redisUrl ?? "redis://127.0.0.1:6379";

function createSnapshot(roomId: string, stateVersion: number): GameRecoverySnapshot {
  return {
    events: [],
    humanSeatIndex: 0,
    humanSeats: [{ seatIndex: 0, userId: 1 }],
    playerUserId: 1,
    roomId,
    state: createInitialGame({
      players: [
        { isBot: false, username: "player" },
        { isBot: true, username: "bot-1" },
        { isBot: true, username: "bot-2" },
        { isBot: true, username: "bot-3" }
      ],
      rules: simpleRuleConfig,
      seed: stateVersion + 1
    }),
    stateVersion,
    version: 1
  };
}

describe.skipIf(!integration)("phase 23 Redis integration", () => {
  it("replicates the newest room snapshot and ignores stale writes", async () => {
    const store = createRoomStateStore(redisConnectionUrl);
    const roomId = `integration-${randomUUID()}`;
    try {
      await store.set(createSnapshot(roomId, 2));
      await store.set(createSnapshot(roomId, 1));
      expect((await store.get(roomId))?.stateVersion).toBe(2);
    } finally {
      await store.close();
    }
  });

  it("serializes the same room across two server coordinators", async () => {
    const first = createRoomCoordinator({ redisUrl: redisConnectionUrl });
    const second = createRoomCoordinator({ redisUrl: redisConnectionUrl });
    let active = 0;
    let maximum = 0;
    try {
      await Promise.all(
        Array.from({ length: 40 }, (_, index) => {
          const coordinator = index % 2 === 0 ? first : second;
          return coordinator.runExclusive("integration-pressure", async () => {
            active += 1;
            maximum = Math.max(maximum, active);
            await new Promise((resolve) => setTimeout(resolve, 2));
            active -= 1;
          });
        })
      );
      expect(maximum).toBe(1);
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  });
});
