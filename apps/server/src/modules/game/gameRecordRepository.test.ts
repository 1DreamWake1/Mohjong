import { createInitialGame, simpleRuleConfig } from "mahjong-core";
import { describe, expect, it } from "vitest";

import {
  createMemoryGameRecordRepository,
  parseGameRecoverySnapshot
} from "./gameRecordRepository.js";

function createSnapshotJson(phase: "playing" | "ended" = "playing"): string {
  const state = createInitialGame({
    players: [
      { isBot: false, username: "player" },
      { isBot: true, username: "bot-1" },
      { isBot: true, username: "bot-2" },
      { isBot: true, username: "bot-3" }
    ],
    rules: simpleRuleConfig,
    seed: 1
  });
  state.phase = phase;

  return JSON.stringify({
    events: [],
    humanSeatIndex: 0,
    humanSeats: [{ seatIndex: 0, userId: 1 }],
    playerUserId: 1,
    roomId: "quick-0001",
    state,
    version: 1
  });
}

describe("game recovery snapshots", () => {
  it("parses a supported active game snapshot", () => {
    expect(parseGameRecoverySnapshot(createSnapshotJson())).toMatchObject({
      roomId: "quick-0001",
      state: { phase: "playing" },
      version: 1
    });
  });

  it("rejects malformed, unsupported, and ended snapshots", () => {
    expect(parseGameRecoverySnapshot("not-json")).toBeUndefined();
    expect(parseGameRecoverySnapshot(JSON.stringify({ version: 2 }))).toBeUndefined();
    expect(parseGameRecoverySnapshot(createSnapshotJson("ended"))).toBeUndefined();
  });

  it("normalizes legacy tile flags when restoring a snapshot", () => {
    const legacySnapshot = JSON.parse(createSnapshotJson()) as {
      state: {
        rules: Record<string, unknown>;
      };
    };
    delete legacySnapshot.state.rules.actions;
    delete legacySnapshot.state.rules.claimPriority;
    delete legacySnapshot.state.rules.winningPatterns;
    delete legacySnapshot.state.rules.scoring;
    delete legacySnapshot.state.rules.tileSet;
    delete legacySnapshot.state.rules.drawCondition;
    delete legacySnapshot.state.rules.enabledFans;
    delete legacySnapshot.state.rules.fanValues;
    legacySnapshot.state.rules.allowChi = false;
    legacySnapshot.state.rules.allowPeng = true;
    legacySnapshot.state.rules.allowGang = true;
    legacySnapshot.state.rules.allowSevenPairs = true;
    legacySnapshot.state.rules.scoringMode = "standard";
    legacySnapshot.state.rules.useWinds = false;
    legacySnapshot.state.rules.useDragons = false;

    const rules = parseGameRecoverySnapshot(JSON.stringify(legacySnapshot))?.state.rules;
    expect(rules).toMatchObject({
      actions: { chi: false, gang: true, peng: true },
      claimPriority: { chi: 1, gang: 2, hu: 3, peng: 2 },
      drawCondition: "wallEmpty",
      enabledFans: {
        chinitsu: true,
        honitsu: true,
        honroutou: true,
        pinfu: true,
        riichi: true,
        sevenPairs: true,
        tanyao: true,
        toitoi: true
      },
      fanValues: {
        chinitsu: 6,
        honitsu: 3,
        honroutou: 2,
        pinfu: 1,
        riichi: 1,
        sevenPairs: 2,
        tanyao: 1,
        toitoi: 2
      },
      scoring: {
        basePoints: 20,
        fanLimit: null,
        fanPointValue: 10,
        minimumFan: 0,
        mode: "standard"
      },
      tileSet: "suited",
      winningPatterns: { sevenPairs: true }
    });
    expect(rules).not.toHaveProperty("allowChi");
    expect(rules).not.toHaveProperty("allowSevenPairs");
    expect(rules).not.toHaveProperty("scoringMode");
    expect(rules).not.toHaveProperty("useWinds");
  });

  it("rejects a recovery snapshot with invalid numeric rule configuration", () => {
    const snapshot = JSON.parse(createSnapshotJson()) as {
      state: {
        rules: {
          scoring: {
            fanLimit: number;
          };
        };
      };
    };
    snapshot.state.rules.scoring.fanLimit = -1;

    expect(parseGameRecoverySnapshot(JSON.stringify(snapshot))).toBeUndefined();
  });

  it("marks active records without valid recovery data as abnormal", async () => {
    const repository = createMemoryGameRecordRepository();
    await repository.createRecord({
      humanSeatIndex: 0,
      playerUserId: 1,
      roomId: "quick-invalid",
      ruleName: "simple",
      ruleVersion: 1
    });

    expect(repository.getRecord("quick-invalid")).toMatchObject({
      ruleName: "simple",
      ruleVersion: 1
    });

    const scan = await repository.listActiveRecoverySnapshots();
    expect(scan).toEqual({ invalidRoomIds: ["quick-invalid"], snapshots: [] });

    await repository.markRecordsAbnormal(scan.invalidRoomIds, "恢复快照无效");
    expect(repository.getRecord("quick-invalid")).toMatchObject({
      endReason: "abnormal",
      events: [expect.objectContaining({ text: "恢复快照无效" })],
      status: "ended"
    });
  });
});
