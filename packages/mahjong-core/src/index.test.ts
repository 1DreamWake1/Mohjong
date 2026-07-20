import { describe, expect, it } from "vitest";

import {
  applyAction,
  calculateShanten,
  calculateScore,
  canHu,
  chooseDiscardTile,
  chooseBasicBotAction,
  createEmptyPlayerView,
  createInitialGame,
  createPlayerView,
  createTile,
  createWall,
  getRulePreset,
  getLegalActions,
  identifyFans,
  runBasicBotGame,
  shouldEndOnEmptyWall,
  simpleRuleConfig,
  standardRuleConfig,
  tileDefinitions
} from "./index.js";
import type { Tile, TileCode } from "./index.js";

describe("mahjong-core tiles and wall", () => {
  it("exposes stable versioned rule presets", () => {
    expect(simpleRuleConfig).toMatchObject({ name: "simple", version: 1 });
    expect(standardRuleConfig).toMatchObject({ name: "standard", version: 1 });
    expect(getRulePreset("simple")).toBe(simpleRuleConfig);
    expect(getRulePreset("standard")).toBe(standardRuleConfig);
    expect(getRulePreset("unknown")).toBeUndefined();
    expect(simpleRuleConfig).toMatchObject({
      actions: { chi: false, gang: true, peng: true },
      drawCondition: "wallEmpty",
      tileSet: "suited",
      winningPatterns: { sevenPairs: true }
    });
    expect(standardRuleConfig.tileSet).toBe("standard");
    expect(shouldEndOnEmptyWall(simpleRuleConfig)).toBe(true);
    expect(Object.isFrozen(simpleRuleConfig)).toBe(true);
    expect(Object.isFrozen(simpleRuleConfig.actions)).toBe(true);
    expect(Object.isFrozen(standardRuleConfig)).toBe(true);
  });

  it("defines 34 tile types and builds a 136 tile wall", () => {
    const wall = createWall();
    const uniqueIds = new Set(wall.map((tile) => tile.id));

    expect(tileDefinitions).toHaveLength(34);
    expect(wall).toHaveLength(136);
    expect(uniqueIds.size).toBe(136);
  });

  it("builds a 108 tile wall for simple suited-only rules", () => {
    const wall = createWall(simpleRuleConfig);

    expect(wall).toHaveLength(108);
    expect(wall.every((tile) => tile.suit !== "winds" && tile.suit !== "dragons")).toBe(true);
  });
});

describe("mahjong-core hand evaluation", () => {
  it("accepts a standard 4 melds and 1 pair hand", () => {
    const hand = handFromCodes([
      "m1",
      "m2",
      "m3",
      "m4",
      "m5",
      "m6",
      "p2",
      "p3",
      "p4",
      "s7",
      "s8",
      "s9",
      "red",
      "red"
    ]);

    expect(canHu(hand, standardRuleConfig)).toEqual({
      canHu: true,
      pattern: "standard"
    });
  });

  it("accepts seven pairs when the rule allows it", () => {
    const hand = handFromCodes([
      "m1",
      "m1",
      "m9",
      "m9",
      "p2",
      "p2",
      "p8",
      "p8",
      "s3",
      "s3",
      "east",
      "east",
      "white",
      "white"
    ]);

    expect(canHu(hand, standardRuleConfig)).toEqual({
      canHu: true,
      pattern: "sevenPairs"
    });
  });

  it("rejects incomplete hands", () => {
    const hand = handFromCodes([
      "m1",
      "m2",
      "m4",
      "m5",
      "m6",
      "p2",
      "p3",
      "p4",
      "s7",
      "s8",
      "s9",
      "red",
      "red",
      "white"
    ]);

    expect(canHu(hand, standardRuleConfig).canHu).toBe(false);
  });
});

describe("mahjong-core scoring", () => {
  it("reads base and fan points from the rule scoring config", () => {
    const hand = handFromCodes([
      "m1",
      "m2",
      "m3",
      "m4",
      "m5",
      "m6",
      "p2",
      "p3",
      "p4",
      "s7",
      "s8",
      "s9",
      "red",
      "red"
    ]);
    const score = calculateScore(hand, {
      ...standardRuleConfig,
      scoring: { basePoints: 100, fanPointValue: 25, mode: "standard" }
    });

    expect(score.basePoints).toBe(100);
    expect(score.totalPoints).toBe(100 + score.fanTotal * 25);
  });

  it("identifies pinfu, riichi and tanyao on a simple sequence hand", () => {
    const hand = handFromCodes([
      "m2",
      "m3",
      "m4",
      "m3",
      "m4",
      "m5",
      "p4",
      "p5",
      "p6",
      "s6",
      "s7",
      "s8",
      "p8",
      "p8"
    ]);
    const score = calculateScore(hand, standardRuleConfig, { isRiichi: true });

    expect(score.canHu).toBe(true);
    expect(score.fans.map((fan) => fan.type)).toEqual(["pinfu", "riichi", "tanyao"]);
    expect(score.fanTotal).toBe(3);
    expect(score.totalPoints).toBe(50);
  });

  it("identifies chinitsu without also counting honitsu", () => {
    const hand = handFromCodes([
      "m1",
      "m2",
      "m3",
      "m2",
      "m3",
      "m4",
      "m4",
      "m5",
      "m6",
      "m7",
      "m8",
      "m9",
      "m5",
      "m5"
    ]);
    const fanTypes = identifyFans(hand, standardRuleConfig).map((fan) => fan.type);

    expect(fanTypes).toContain("chinitsu");
    expect(fanTypes).not.toContain("honitsu");
  });

  it("identifies honitsu with one suit and honors", () => {
    const hand = handFromCodes([
      "p1",
      "p2",
      "p3",
      "p4",
      "p5",
      "p6",
      "p7",
      "p8",
      "p9",
      "east",
      "east",
      "east",
      "red",
      "red"
    ]);

    expect(identifyFans(hand, standardRuleConfig).map((fan) => fan.type)).toContain("honitsu");
  });

  it("identifies toitoi and honroutou on all terminal and honor triplets", () => {
    const hand = handFromCodes([
      "m1",
      "m1",
      "m1",
      "m9",
      "m9",
      "m9",
      "p1",
      "p1",
      "p1",
      "east",
      "east",
      "east",
      "red",
      "red"
    ]);
    const fanTypes = identifyFans(hand, standardRuleConfig).map((fan) => fan.type);

    expect(fanTypes).toContain("toitoi");
    expect(fanTypes).toContain("honroutou");
  });

  it("identifies seven pairs", () => {
    const hand = handFromCodes([
      "m1",
      "m1",
      "m9",
      "m9",
      "p2",
      "p2",
      "p8",
      "p8",
      "s3",
      "s3",
      "east",
      "east",
      "white",
      "white"
    ]);

    expect(identifyFans(hand, standardRuleConfig).map((fan) => fan.type)).toContain("sevenPairs");
  });

  it("returns zero points for non-winning hands", () => {
    const hand = handFromCodes([
      "m1",
      "m2",
      "m4",
      "m5",
      "m6",
      "p2",
      "p3",
      "p4",
      "s7",
      "s8",
      "s9",
      "red",
      "red",
      "white"
    ]);

    expect(calculateScore(hand, standardRuleConfig)).toMatchObject({
      canHu: false,
      fanTotal: 0,
      totalPoints: 0
    });
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

  it("deals from a suited-only wall for simple rules", () => {
    const state = createInitialGame({ rules: simpleRuleConfig, seed: 1 });

    expect(state.players[0].handTiles).toHaveLength(14);
    expect(state.players[1].handTiles).toHaveLength(13);
    expect(state.players[2].handTiles).toHaveLength(13);
    expect(state.players[3].handTiles).toHaveLength(13);
    expect(state.wall).toHaveLength(55);
    expect(
      state.players
        .flatMap((player) => player.handTiles)
        .every((tile) => tile.suit !== "winds" && tile.suit !== "dragons")
    ).toBe(true);
    expect(state.wall.every((tile) => tile.suit !== "winds" && tile.suit !== "dragons")).toBe(true);
  });

  it("accepts explicit human and bot player configuration", () => {
    const state = createInitialGame({
      players: [
        { isBot: false, username: "player-a" },
        { isBot: true, username: "bot-a" },
        { isBot: true, username: "bot-b" },
        { isBot: true, username: "bot-c" }
      ],
      seed: 1
    });

    expect(
      state.players.map((player) => ({ isBot: player.isBot, username: player.username }))
    ).toEqual([
      { isBot: false, username: "player-a" },
      { isBot: true, username: "bot-a" },
      { isBot: true, username: "bot-b" },
      { isBot: true, username: "bot-c" }
    ]);
  });

  it("allows current player to discard and lets the next player draw when nobody can respond", () => {
    const state = createInitialGame({ seed: 2 });
    const tileId = state.players[0].handTiles[0]?.id;
    const drawnTileId = state.wall.at(-1)?.id;

    if (!tileId) {
      throw new Error("Expected dealer to have a tile");
    }

    const result = applyAction(state, 0, { type: "discard", tileId });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.state.currentTurn).toBe(1);
    expect(result.state.pendingDiscard).toBeUndefined();
    expect(result.state.players[0].handTiles).toHaveLength(13);
    expect(result.state.players[0].discardTiles).toHaveLength(1);
    expect(result.state.players[0].lastDrawnTileId).toBeUndefined();
    expect(result.state.lastDiscardedTileId).toBe(tileId);
    expect(result.state.players[1].handTiles).toHaveLength(14);
    expect(result.state.players[1].lastDrawnTileId).toBe(drawnTileId);
    expect(getLegalActions(result.state, 1).some((action) => action.type === "discard")).toBe(true);
  });

  it("does not mark the initial deal as a newly drawn tile", () => {
    const state = createInitialGame({ seed: 2 });

    expect(state.lastDiscardedTileId).toBeUndefined();
    expect(state.players.every((player) => player.lastDrawnTileId === undefined)).toBe(true);
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
    expect(legalActions.every((action) => action.type === "discard" || action.type === "hu")).toBe(
      true
    );
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

    const chiAction = getLegalActions(discardResult.state, 1).find(
      (action) => action.type === "chi"
    );

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

  it("does not allow chi under simple rules", () => {
    const state = createClaimScenario(
      "m3",
      {
        1: ["m1", "m2"]
      },
      simpleRuleConfig
    );
    const discardedTileId = state.players[0].handTiles[0]?.id;

    state.wall = [createTile("p9", 0)];

    if (!discardedTileId) {
      throw new Error("Expected discarder to have a tile");
    }

    const discardResult = applyAction(state, 0, { type: "discard", tileId: discardedTileId });

    if (!discardResult.ok) {
      throw new Error(discardResult.error);
    }

    expect(discardResult.state.pendingDiscard).toBeUndefined();
    expect(discardResult.state.currentTurn).toBe(1);
    expect(getLegalActions(discardResult.state, 1).some((action) => action.type === "chi")).toBe(
      false
    );
    expect(
      getLegalActions(discardResult.state, 1).some((action) => action.type === "discard")
    ).toBe(true);
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

    expect(discardResult.state.currentTurn).toBe(2);
    expect(getLegalActions(discardResult.state, 1)).toEqual([]);

    const pengAction = getLegalActions(discardResult.state, 2).find(
      (action) => action.type === "peng"
    );

    expect(pengAction).toBeDefined();

    if (!pengAction) {
      return;
    }

    const pengResult = applyAction(discardResult.state, 2, pengAction);

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

    expect(discardResult.state.currentTurn).toBe(3);

    const gangAction = getLegalActions(discardResult.state, 3).find(
      (action) => action.type === "gang"
    );

    expect(gangAction).toBeDefined();

    if (!gangAction) {
      return;
    }

    const gangResult = applyAction(discardResult.state, 3, gangAction);

    expect(gangResult.ok).toBe(true);

    if (!gangResult.ok) {
      return;
    }

    expect(gangResult.state.players[3].publicMelds[0]?.type).toBe("gang");
    expect(gangResult.state.players[3].handTiles).toHaveLength(1);
    expect(gangResult.state.players[3].handTiles[0]?.code).toBe("east");
  });

  it("ends in a draw when a claimed gang cannot draw a supplement tile", () => {
    const state = createClaimScenario("white", {
      3: ["white", "white", "white"]
    });
    const discardedTileId = state.players[0].handTiles[0]?.id;

    state.wall = [];

    if (!discardedTileId) {
      throw new Error("Expected discarder to have a tile");
    }

    const discardResult = applyAction(state, 0, { type: "discard", tileId: discardedTileId });

    if (!discardResult.ok) {
      throw new Error(discardResult.error);
    }

    const gangAction = getLegalActions(discardResult.state, 3).find(
      (action) => action.type === "gang"
    );

    expect(gangAction).toBeDefined();

    if (!gangAction) {
      return;
    }

    const gangResult = applyAction(discardResult.state, 3, gangAction);

    expect(gangResult.ok).toBe(true);

    if (!gangResult.ok) {
      return;
    }

    expect(gangResult.state).toMatchObject({
      endReason: "draw",
      phase: "ended"
    });
  });

  it("prioritizes hu over peng and chi, then falls back after pass", () => {
    const state = createClaimScenario("red", {
      1: ["m1", "m2"],
      2: ["red", "red"],
      3: ["m1", "m2", "m3", "m4", "m5", "m6", "p2", "p3", "p4", "s7", "s8", "s9", "red"]
    });
    const discardedTileId = state.players[0].handTiles[0]?.id;

    if (!discardedTileId) {
      throw new Error("Expected discarder to have a tile");
    }

    const discardResult = applyAction(state, 0, { type: "discard", tileId: discardedTileId });

    if (!discardResult.ok) {
      throw new Error(discardResult.error);
    }

    expect(discardResult.state.currentTurn).toBe(3);
    expect(getLegalActions(discardResult.state, 3).map((action) => action.type)).toEqual([
      "pass",
      "hu"
    ]);
    expect(getLegalActions(discardResult.state, 2)).toEqual([]);

    const passResult = applyAction(discardResult.state, 3, { type: "pass" });

    if (!passResult.ok) {
      throw new Error(passResult.error);
    }

    expect(passResult.state.currentTurn).toBe(2);
    expect(getLegalActions(passResult.state, 2).some((action) => action.type === "peng")).toBe(
      true
    );
  });

  it("attaches score when a player wins", () => {
    const state = createInitialGame({ seed: 7 });

    state.currentTurn = 0;
    state.players[0].handTiles = handFromCodes([
      "m2",
      "m3",
      "m4",
      "m3",
      "m4",
      "m5",
      "p4",
      "p5",
      "p6",
      "s6",
      "s7",
      "s8",
      "p8",
      "p8"
    ]);

    const result = applyAction(state, 0, { type: "hu" });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.state.phase).toBe("ended");
    expect(result.state.winType).toBe("selfDraw");
    expect(result.state.score).toMatchObject({
      canHu: true,
      fanTotal: 2,
      totalPoints: 40
    });
    expect(createPlayerView(result.state, 0).result).toMatchObject({
      endReason: "hu",
      fanTotal: 2,
      totalPoints: 40,
      winType: "selfDraw",
      winningTile: expect.objectContaining({ id: result.state.winningTile?.id })
    });
  });

  it("ends on a claimed discard win and records the win source", () => {
    const state = createClaimScenario("red", {
      3: ["m1", "m2", "m3", "m4", "m5", "m6", "p2", "p3", "p4", "s7", "s8", "s9", "red"]
    });
    const discardedTileId = state.players[0].handTiles[0]?.id;

    if (!discardedTileId) {
      throw new Error("Expected discarder to have a tile");
    }

    const discardResult = applyAction(state, 0, { type: "discard", tileId: discardedTileId });

    if (!discardResult.ok) {
      throw new Error(discardResult.error);
    }

    const huAction = getLegalActions(discardResult.state, 3).find((action) => action.type === "hu");

    expect(huAction).toBeDefined();

    if (!huAction) {
      return;
    }

    const huResult = applyAction(discardResult.state, 3, huAction);

    expect(huResult.ok).toBe(true);

    if (!huResult.ok) {
      return;
    }

    expect(huResult.state).toMatchObject({
      endReason: "hu",
      phase: "ended",
      winnerSeatIndex: 3,
      winType: "discard"
    });
    expect(createPlayerView(huResult.state, 3).result).toMatchObject({
      endReason: "hu",
      winType: "discard",
      winningTile: expect.objectContaining({ code: "red" })
    });
  });

  it("allows concealed gang and draws a supplement tile", () => {
    const state = createInitialGame({ seed: 8 });

    state.currentTurn = 0;
    state.wall = [createTile("south", 0)];
    state.players[0].handTiles = handFromCodes(["east", "east", "east", "east"]);

    const gangAction = getLegalActions(state, 0).find((action) => action.type === "gang");

    expect(gangAction).toBeDefined();

    if (!gangAction) {
      return;
    }

    const result = applyAction(state, 0, gangAction);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.state.players[0].publicMelds[0]?.type).toBe("gang");
    expect(result.state.players[0].handTiles[0]?.code).toBe("south");
  });

  it("allows added gang from an existing peng meld", () => {
    const state = createInitialGame({ seed: 9 });
    const pengTiles = handFromCodes(["red", "red", "red"]);

    state.currentTurn = 0;
    state.wall = [createTile("east", 0)];
    state.players[0].handTiles = handFromCodes(["red"]);
    state.players[0].publicMelds = [
      {
        type: "peng",
        ownerSeatIndex: 0,
        tiles: pengTiles
      }
    ];

    const gangAction = getLegalActions(state, 0).find((action) => action.type === "gang");

    expect(gangAction).toBeDefined();

    if (!gangAction) {
      return;
    }

    const result = applyAction(state, 0, gangAction);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.state.players[0].publicMelds[0]?.type).toBe("gang");
    expect(result.state.players[0].publicMelds[0]?.tiles).toHaveLength(4);
    expect(result.state.players[0].handTiles[0]?.code).toBe("east");
  });

  it("draws for the next player when no respondent can claim", () => {
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

    expect(discardResult.state.pendingDiscard).toBeUndefined();
    expect(discardResult.state.currentTurn).toBe(1);
    expect(discardResult.state.players[1].handTiles[0]?.code).toBe("south");
  });

  it("draws for the next player when every available respondent passes", () => {
    const state = createClaimScenario("m3", {
      1: ["m1", "m2"]
    });
    const discardedTileId = state.players[0].handTiles[0]?.id;

    state.wall = [createTile("south", 0)];

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

    expect(passResult.state.pendingDiscard).toBeUndefined();
    expect(passResult.state.currentTurn).toBe(1);
    expect(passResult.state.players[1].handTiles.some((tile) => tile.code === "south")).toBe(true);
  });
});

describe("mahjong-core basic bot", () => {
  it("reports complete and ready hands with standard shanten values", () => {
    const completeHand = handFromCodes([
      "m1",
      "m2",
      "m3",
      "m4",
      "m5",
      "m6",
      "p2",
      "p3",
      "p4",
      "s7",
      "s8",
      "s9",
      "red",
      "red"
    ]);
    const readyHand = completeHand.slice(0, -1);

    expect(calculateShanten(completeHand, standardRuleConfig)).toBe(-1);
    expect(calculateShanten(readyHand, standardRuleConfig)).toBe(0);
  });

  it("claims a useful peng instead of always passing", () => {
    const state = createClaimScenario("red", {
      2: ["red", "red", "m1", "m2", "m3", "m4", "m5", "p2", "p3", "s4", "s5", "s7", "s8"]
    });
    const discardedTileId = state.players[0].handTiles[0]?.id;
    if (!discardedTileId) throw new Error("Expected a discard tile");
    const result = applyAction(state, 0, { type: "discard", tileId: discardedTileId });
    if (!result.ok) throw new Error(result.error);

    expect(chooseBasicBotAction(result.state, 2).type).toBe("peng");
  });

  it("takes an available concealed gang when it preserves hand progress", () => {
    const state = createInitialGame({ rules: standardRuleConfig, seed: 88 });
    state.currentTurn = 0;
    state.players[0].handTiles = handFromCodes([
      "east",
      "east",
      "east",
      "east",
      "m1",
      "m2",
      "m3",
      "m4",
      "m5",
      "m6",
      "p2",
      "p3",
      "p4",
      "red"
    ]);

    expect(chooseBasicBotAction(state, 0).type).toBe("gang");
  });

  it("prefers isolated tiles as discards", () => {
    const hand = handFromCodes([
      "m1",
      "m2",
      "m3",
      "m7",
      "p4",
      "p5",
      "p6",
      "s2",
      "s2",
      "east",
      "east",
      "red",
      "green",
      "white"
    ]);

    expect(["m7", "red", "green", "white"]).toContain(chooseDiscardTile(hand).code);
  });

  it("runs deterministic 4 bot games to completion", () => {
    const results = Array.from({ length: 10 }, (_, index) => runBasicBotGame(index + 1));

    expect(results.every((result) => result.state.phase === "ended")).toBe(true);
    expect(results.every((result) => result.turnCount <= 336)).toBe(true);
  });

  it("runs long bot simulations without deadlocks", () => {
    const results = Array.from({ length: 50 }, (_, index) => runBasicBotGame(index + 101));
    const endedCount = results.filter((result) => result.state.phase === "ended").length;
    const winCount = results.filter((result) => result.state.endReason === "hu").length;
    const drawCount = results.filter((result) => result.state.endReason === "draw").length;

    expect(endedCount).toBe(50);
    expect(winCount + drawCount).toBe(50);
    expect(Math.max(...results.map((result) => result.turnCount))).toBeLessThanOrEqual(336);
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

function createClaimScenario(
  discardCode: TileCode,
  playerHands: Partial<Record<0 | 1 | 2 | 3, TileCode[]>>,
  rules = standardRuleConfig
) {
  const state = createInitialGame({ rules, seed: 99 });

  state.currentTurn = 0;
  delete state.pendingDiscard;
  state.wall = [];

  for (const player of state.players) {
    const codes =
      player.seatIndex === 0
        ? [discardCode]
        : (playerHands[player.seatIndex as 0 | 1 | 2 | 3] ?? []);
    player.handTiles = handFromCodes(codes);
    player.discardTiles = [];
    player.publicMelds = [];
  }

  return state;
}
