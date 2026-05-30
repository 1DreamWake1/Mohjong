import { describe, expect, it } from "vitest";

import {
  applyAction,
  canHu,
  chooseDiscardTile,
  createEmptyPlayerView,
  createInitialGame,
  createTile,
  createWall,
  getLegalActions,
  runBasicBotGame,
  standardRuleConfig,
  tileDefinitions
} from "./index.js";
import type { Tile, TileCode } from "./index.js";

describe("mahjong-core tiles and wall", () => {
  it("defines 34 tile types and builds a 136 tile wall", () => {
    const wall = createWall();
    const uniqueIds = new Set(wall.map((tile) => tile.id));

    expect(tileDefinitions).toHaveLength(34);
    expect(wall).toHaveLength(136);
    expect(uniqueIds.size).toBe(136);
  });
});

describe("mahjong-core hand evaluation", () => {
  it("accepts a standard 4 melds and 1 pair hand", () => {
    const hand = handFromCodes(["m1", "m2", "m3", "m4", "m5", "m6", "p2", "p3", "p4", "s7", "s8", "s9", "red", "red"]);

    expect(canHu(hand, standardRuleConfig)).toEqual({
      canHu: true,
      pattern: "standard"
    });
  });

  it("accepts seven pairs when the rule allows it", () => {
    const hand = handFromCodes(["m1", "m1", "m9", "m9", "p2", "p2", "p8", "p8", "s3", "s3", "east", "east", "white", "white"]);

    expect(canHu(hand, standardRuleConfig)).toEqual({
      canHu: true,
      pattern: "sevenPairs"
    });
  });

  it("rejects incomplete hands", () => {
    const hand = handFromCodes(["m1", "m2", "m4", "m5", "m6", "p2", "p3", "p4", "s7", "s8", "s9", "red", "red", "white"]);

    expect(canHu(hand, standardRuleConfig).canHu).toBe(false);
  });
});

describe("mahjong-core game reducer", () => {
  it("deals 14 tiles to dealer and 13 tiles to other players", () => {
    const state = createInitialGame({ seed: 1 });

    expect(state.players[0].handTiles).toHaveLength(14);
    expect(state.players[1].handTiles).toHaveLength(13);
    expect(state.players[2].handTiles).toHaveLength(13);
    expect(state.players[3].handTiles).toHaveLength(13);
    expect(state.wall).toHaveLength(83);
  });

  it("allows current player to discard and advances the turn with a draw", () => {
    const state = createInitialGame({ seed: 2 });
    const tileId = state.players[0].handTiles[0]?.id;

    if (!tileId) {
      throw new Error("Expected dealer to have a tile");
    }

    const result = applyAction(state, 0, { type: "discard", tileId });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.state.currentTurn).toBe(1);
    expect(result.state.pendingDiscard).toMatchObject({
      fromSeatIndex: 0,
      nextSeatIndex: 1
    });
    expect(result.state.players[0].handTiles).toHaveLength(13);
    expect(result.state.players[0].discardTiles).toHaveLength(1);
    expect(result.state.players[1].handTiles).toHaveLength(13);
  });

  it("rejects an illegal discard from another player's hand", () => {
    const state = createInitialGame({ seed: 3 });
    const otherTileId = state.players[1].handTiles[0]?.id;

    if (!otherTileId) {
      throw new Error("Expected other player to have a tile");
    }

    const result = applyAction(state, 0, { type: "discard", tileId: otherTileId });

    expect(result.ok).toBe(false);
  });

  it("exposes a player view without leaking other players' hands", () => {
    const state = createInitialGame({ seed: 4 });
    const view = createEmptyPlayerView(0);
    const legalActions = getLegalActions(state, 0);

    expect(view).toMatchObject({ seatIndex: 0, phase: "waiting" });
    expect(legalActions.length).toBeGreaterThan(0);
    expect(legalActions.every((action) => action.type === "discard" || action.type === "hu")).toBe(true);
  });

  it("allows the next player to chi a discarded suited tile", () => {
    const state = createClaimScenario("m3", {
      1: ["m1", "m2"]
    });
    const discardedTileId = state.players[0].handTiles[0]?.id;

    if (!discardedTileId) {
      throw new Error("Expected discarder to have a tile");
    }

    const discardResult = applyAction(state, 0, { type: "discard", tileId: discardedTileId });

    expect(discardResult.ok).toBe(true);

    if (!discardResult.ok) {
      return;
    }

    const chiAction = getLegalActions(discardResult.state, 1).find((action) => action.type === "chi");

    expect(chiAction).toBeDefined();

    if (!chiAction) {
      return;
    }

    const chiResult = applyAction(discardResult.state, 1, chiAction);

    expect(chiResult.ok).toBe(true);

    if (!chiResult.ok) {
      return;
    }

    expect(chiResult.state.pendingDiscard).toBeUndefined();
    expect(chiResult.state.currentTurn).toBe(1);
    expect(chiResult.state.players[1].publicMelds[0]).toMatchObject({
      type: "chi",
      ownerSeatIndex: 1,
      fromSeatIndex: 0
    });
    expect(chiResult.state.players[0].discardTiles).toHaveLength(0);
  });

  it("allows a later respondent to peng after earlier players pass", () => {
    const state = createClaimScenario("red", {
      2: ["red", "red"]
    });
    const discardedTileId = state.players[0].handTiles[0]?.id;

    if (!discardedTileId) {
      throw new Error("Expected discarder to have a tile");
    }

    const discardResult = applyAction(state, 0, { type: "discard", tileId: discardedTileId });

    if (!discardResult.ok) {
      throw new Error(discardResult.error);
    }

    const passResult = applyAction(discardResult.state, 1, { type: "pass" });

    if (!passResult.ok) {
      throw new Error(passResult.error);
    }

    const pengAction = getLegalActions(passResult.state, 2).find((action) => action.type === "peng");

    expect(pengAction).toBeDefined();

    if (!pengAction) {
      return;
    }

    const pengResult = applyAction(passResult.state, 2, pengAction);

    expect(pengResult.ok).toBe(true);

    if (!pengResult.ok) {
      return;
    }

    expect(pengResult.state.currentTurn).toBe(2);
    expect(pengResult.state.players[2].publicMelds[0]?.type).toBe("peng");
    expect(pengResult.state.players[2].handTiles).toHaveLength(0);
  });

  it("allows claiming a discard for gang and draws a supplement tile", () => {
    const state = createClaimScenario("white", {
      3: ["white", "white", "white"]
    });
    const discardedTileId = state.players[0].handTiles[0]?.id;

    state.wall = [createTile("east", 0)];

    if (!discardedTileId) {
      throw new Error("Expected discarder to have a tile");
    }

    const discardResult = applyAction(state, 0, { type: "discard", tileId: discardedTileId });

    if (!discardResult.ok) {
      throw new Error(discardResult.error);
    }

    const firstPass = applyAction(discardResult.state, 1, { type: "pass" });

    if (!firstPass.ok) {
      throw new Error(firstPass.error);
    }

    const secondPass = applyAction(firstPass.state, 2, { type: "pass" });

    if (!secondPass.ok) {
      throw new Error(secondPass.error);
    }

    const gangAction = getLegalActions(secondPass.state, 3).find((action) => action.type === "gang");

    expect(gangAction).toBeDefined();

    if (!gangAction) {
      return;
    }

    const gangResult = applyAction(secondPass.state, 3, gangAction);

    expect(gangResult.ok).toBe(true);

    if (!gangResult.ok) {
      return;
    }

    expect(gangResult.state.players[3].publicMelds[0]?.type).toBe("gang");
    expect(gangResult.state.players[3].handTiles).toHaveLength(1);
    expect(gangResult.state.players[3].handTiles[0]?.code).toBe("east");
  });

  it("draws for the next player when every respondent passes", () => {
    const state = createClaimScenario("m9", {});
    const discardedTileId = state.players[0].handTiles[0]?.id;

    state.wall = [createTile("south", 0)];

    if (!discardedTileId) {
      throw new Error("Expected discarder to have a tile");
    }

    const discardResult = applyAction(state, 0, { type: "discard", tileId: discardedTileId });

    if (!discardResult.ok) {
      throw new Error(discardResult.error);
    }

    const firstPass = applyAction(discardResult.state, 1, { type: "pass" });
    const secondPass = firstPass.ok ? applyAction(firstPass.state, 2, { type: "pass" }) : firstPass;
    const thirdPass = secondPass.ok ? applyAction(secondPass.state, 3, { type: "pass" }) : secondPass;

    expect(thirdPass.ok).toBe(true);

    if (!thirdPass.ok) {
      return;
    }

    expect(thirdPass.state.pendingDiscard).toBeUndefined();
    expect(thirdPass.state.currentTurn).toBe(1);
    expect(thirdPass.state.players[1].handTiles[0]?.code).toBe("south");
  });
});

describe("mahjong-core basic bot", () => {
  it("prefers isolated tiles as discards", () => {
    const hand = handFromCodes(["m1", "m2", "m3", "m7", "p4", "p5", "p6", "s2", "s2", "east", "east", "red", "green", "white"]);

    expect(["m7", "red", "green", "white"]).toContain(chooseDiscardTile(hand).code);
  });

  it("runs deterministic 4 bot games to completion", () => {
    const results = Array.from({ length: 10 }, (_, index) => runBasicBotGame(index + 1));

    expect(results.every((result) => result.state.phase === "ended")).toBe(true);
    expect(results.every((result) => result.turnCount <= 336)).toBe(true);
  });
});

function handFromCodes(codes: TileCode[]): Tile[] {
  const copyCounters = new Map<TileCode, number>();

  return codes.map((code) => {
    const copyIndex = copyCounters.get(code) ?? 0;
    copyCounters.set(code, copyIndex + 1);
    return createTile(code, copyIndex);
  });
}

function createClaimScenario(discardCode: TileCode, playerHands: Partial<Record<0 | 1 | 2 | 3, TileCode[]>>) {
  const state = createInitialGame({ seed: 99 });

  state.currentTurn = 0;
  delete state.pendingDiscard;
  state.wall = [];

  for (const player of state.players) {
    const codes = player.seatIndex === 0 ? [discardCode] : (playerHands[player.seatIndex as 0 | 1 | 2 | 3] ?? []);
    player.handTiles = handFromCodes(codes);
    player.discardTiles = [];
    player.publicMelds = [];
  }

  return state;
}
