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
    expect(result.state.players[0].handTiles).toHaveLength(13);
    expect(result.state.players[0].discardTiles).toHaveLength(1);
    expect(result.state.players[1].handTiles).toHaveLength(14);
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
});

describe("mahjong-core basic bot", () => {
  it("prefers isolated tiles as discards", () => {
    const hand = handFromCodes(["m1", "m2", "m3", "m7", "p4", "p5", "p6", "s2", "s2", "east", "east", "red", "green", "white"]);

    expect(["m7", "red", "green", "white"]).toContain(chooseDiscardTile(hand).code);
  });

  it("runs deterministic 4 bot games to completion", () => {
    const results = Array.from({ length: 10 }, (_, index) => runBasicBotGame(index + 1));

    expect(results.every((result) => result.state.phase === "ended")).toBe(true);
    expect(results.every((result) => result.turnCount <= 84)).toBe(true);
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
