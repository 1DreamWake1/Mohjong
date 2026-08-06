import type { Action } from "@mahjong/shared";

import { getLegalActions, type MahjongGameState } from "../game.js";
import { countTiles } from "../hand.js";
import { isSuited, type Tile } from "../tiles.js";
import { calculateShanten } from "./handPotential.js";

export function chooseBasicBotAction(state: MahjongGameState, seatIndex: number): Action {
  const legalActions = getLegalActions(state, seatIndex);
  const openingAction = chooseSichuanOpeningAction(state, seatIndex, legalActions);
  if (openingAction) {
    return openingAction;
  }

  const huAction = legalActions.find((action) => action.type === "hu");

  if (huAction) {
    return huAction;
  }

  const player = state.players[seatIndex];
  if (!player) {
    return legalActions[0] ?? { type: "pass" };
  }

  const strategicAction = chooseStrategicMeldAction(state, seatIndex, legalActions);
  if (strategicAction) {
    return strategicAction;
  }

  const discardActions = legalActions.filter((action) => action.type === "discard");

  if (discardActions.length === 0) {
    return { type: "pass" };
  }

  const discardTile = chooseDiscardTileForState(state, seatIndex);

  return (
    discardActions.find((action) => action.tileId === discardTile.id) ??
    discardActions[0] ?? { type: "pass" }
  );
}

function chooseSichuanOpeningAction(
  state: MahjongGameState,
  seatIndex: number,
  legalActions: readonly Action[]
): Action | undefined {
  const player = state.players[seatIndex];
  if (!player) return undefined;

  if (state.phase === "choose-missing-suit") {
    const suitCounts = new Map<string, number>();
    for (const tile of player.handTiles) {
      suitCounts.set(tile.suit, (suitCounts.get(tile.suit) ?? 0) + 1);
    }
    return [...legalActions].sort(
      (left, right) =>
        (suitCounts.get(left.suit ?? "") ?? 0) - (suitCounts.get(right.suit ?? "") ?? 0)
    )[0];
  }

  if (state.phase !== "exchange-three") return undefined;

  const counts = countTiles(player.handTiles);
  const exchangeActions = legalActions.filter((action) => action.type === "exchangeThree");
  const candidates = exchangeActions.map((action) => {
    const tiles = player.handTiles.filter((tile) => action.tileIds?.includes(tile.id));
    const suit = tiles[0]?.suit ?? "";
    return {
      action,
      keepScore: tiles.reduce(
        (total, tile) => total + getTileKeepScore(tile, player.handTiles, counts),
        0
      ),
      suitCount: player.handTiles.filter((tile) => tile.suit === suit).length
    };
  });

  candidates.sort(
    (left, right) => left.suitCount - right.suitCount || left.keepScore - right.keepScore
  );
  return candidates[0]?.action;
}

function chooseStrategicMeldAction(
  state: MahjongGameState,
  seatIndex: number,
  legalActions: readonly Action[]
): Action | undefined {
  const player = state.players[seatIndex];
  if (!player) return undefined;

  const meldActions = legalActions.filter(
    (action) => action.type === "chi" || action.type === "peng" || action.type === "gang"
  );
  if (meldActions.length === 0) return undefined;

  const currentShanten = calculateShanten(player.handTiles, state.rules, player.publicMelds.length);
  const candidates = meldActions.map((action) => {
    const removedIds = new Set(action.tileIds ?? []);
    const remainingTiles = player.handTiles.filter((tile) => !removedIds.has(tile.id));
    const nextOpenMeldCount = player.publicMelds.length + (action.tileIds?.length === 1 ? 0 : 1);
    const shanten = getBestPostClaimShanten(remainingTiles, state, nextOpenMeldCount, action.type);
    return { action, shanten };
  });

  candidates.sort(
    (left, right) =>
      left.shanten - right.shanten || getMeldPriority(right.action) - getMeldPriority(left.action)
  );
  const best = candidates[0];
  return best && best.shanten <= currentShanten ? best.action : undefined;
}

function getBestPostClaimShanten(
  tiles: readonly Tile[],
  state: MahjongGameState,
  openMeldCount: number,
  actionType: Action["type"]
): number {
  if (actionType === "gang" || tiles.length % 3 === 1) {
    return calculateShanten(tiles, state.rules, openMeldCount);
  }

  return Math.min(
    ...tiles.map((discardTile) =>
      calculateShanten(
        tiles.filter((tile) => tile.id !== discardTile.id),
        state.rules,
        openMeldCount
      )
    )
  );
}

function getMeldPriority(action: Action): number {
  if (action.type === "gang") return 3;
  if (action.type === "peng") return 2;
  if (action.type === "chi") return 1;
  return 0;
}

function chooseDiscardTileForState(state: MahjongGameState, seatIndex: number): Tile {
  const player = state.players[seatIndex];
  if (!player) throw new Error("Cannot choose discard for a missing player");

  const missingSuit = state.missingSuits?.[seatIndex];
  const missingSuitTiles = missingSuit
    ? player.handTiles.filter((tile) => tile.suit === missingSuit)
    : [];
  const discardPool = missingSuitTiles.length > 0 ? missingSuitTiles : player.handTiles;
  const candidates = discardPool.map((tile) => {
    const remainingTiles = player.handTiles.filter((candidate) => candidate.id !== tile.id);
    const shanten = calculateShanten(remainingTiles, state.rules, player.publicMelds.length);
    return {
      tile,
      shanten,
      keepScore: getTileKeepScore(tile, player.handTiles, countTiles(player.handTiles))
    };
  });

  const bestShanten = Math.min(...candidates.map((candidate) => candidate.shanten));
  const bestCandidates = candidates
    .filter((candidate) => candidate.shanten === bestShanten)
    .map((candidate) => {
      const remainingTiles = player.handTiles.filter((tile) => tile.id !== candidate.tile.id);
      return {
        ...candidate,
        improvementCount: countImprovingTileTypes(
          remainingTiles,
          state,
          player.publicMelds.length,
          candidate.shanten
        )
      };
    });

  bestCandidates.sort(
    (left, right) =>
      left.shanten - right.shanten ||
      right.improvementCount - left.improvementCount ||
      left.keepScore - right.keepScore
  );
  const tile = bestCandidates[0]?.tile;
  if (!tile) throw new Error("Cannot choose discard from an empty hand");
  return tile;
}

function countImprovingTileTypes(
  handTiles: readonly Tile[],
  state: MahjongGameState,
  openMeldCount: number,
  currentShanten: number
): number {
  return state.wall.reduce((count, tile, index, wall) => {
    if (wall.findIndex((candidate) => candidate.code === tile.code) !== index) return count;
    return calculateShanten([...handTiles, tile], state.rules, openMeldCount) < currentShanten
      ? count + 1
      : count;
  }, 0);
}

export function chooseDiscardTile(handTiles: readonly Tile[]): Tile {
  const counts = countTiles(handTiles);
  const scoredTiles = handTiles.map((tile) => ({
    tile,
    score: getTileKeepScore(tile, handTiles, counts)
  }));

  scoredTiles.sort((a, b) => a.score - b.score);

  const tile = scoredTiles[0]?.tile;

  if (!tile) {
    throw new Error("Cannot choose discard from an empty hand");
  }

  return tile;
}

function getTileKeepScore(
  tile: Tile,
  handTiles: readonly Tile[],
  counts: ReadonlyMap<string, number>
): number {
  let score = 0;
  const sameCount = counts.get(tile.code) ?? 0;

  if (sameCount >= 2) {
    score += 4;
  }

  if (!isSuited(tile)) {
    return score;
  }

  const hasLeftNeighbor = handTiles.some(
    (candidate) => candidate.suit === tile.suit && candidate.rank === tile.rank - 1
  );
  const hasRightNeighbor = handTiles.some(
    (candidate) => candidate.suit === tile.suit && candidate.rank === tile.rank + 1
  );
  const hasNearLeft = handTiles.some(
    (candidate) => candidate.suit === tile.suit && candidate.rank === tile.rank - 2
  );
  const hasNearRight = handTiles.some(
    (candidate) => candidate.suit === tile.suit && candidate.rank === tile.rank + 2
  );

  if (hasLeftNeighbor || hasRightNeighbor) {
    score += 3;
  }

  if (hasNearLeft || hasNearRight) {
    score += 1;
  }

  return score;
}
