import type { Action } from "@mahjong/shared";

import { getLegalActions, type MahjongGameState } from "../game.js";
import { countTiles } from "../hand.js";
import { isSuited, type Tile } from "../tiles.js";

export function chooseBasicBotAction(state: MahjongGameState, seatIndex: number): Action {
  const legalActions = getLegalActions(state, seatIndex);
  const huAction = legalActions.find((action) => action.type === "hu");

  if (huAction) {
    return huAction;
  }

  const discardActions = legalActions.filter((action) => action.type === "discard");

  if (discardActions.length === 0) {
    return { type: "pass" };
  }

  const player = state.players[seatIndex];

  if (!player) {
    return discardActions[0] ?? { type: "pass" };
  }

  const discardTile = chooseDiscardTile(player.handTiles);

  return discardActions.find((action) => action.tileId === discardTile.id) ?? discardActions[0] ?? { type: "pass" };
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

function getTileKeepScore(tile: Tile, handTiles: readonly Tile[], counts: ReadonlyMap<string, number>): number {
  let score = 0;
  const sameCount = counts.get(tile.code) ?? 0;

  if (sameCount >= 2) {
    score += 4;
  }

  if (!isSuited(tile)) {
    return score;
  }

  const hasLeftNeighbor = handTiles.some((candidate) => candidate.suit === tile.suit && candidate.rank === tile.rank - 1);
  const hasRightNeighbor = handTiles.some((candidate) => candidate.suit === tile.suit && candidate.rank === tile.rank + 1);
  const hasNearLeft = handTiles.some((candidate) => candidate.suit === tile.suit && candidate.rank === tile.rank - 2);
  const hasNearRight = handTiles.some((candidate) => candidate.suit === tile.suit && candidate.rank === tile.rank + 2);

  if (hasLeftNeighbor || hasRightNeighbor) {
    score += 3;
  }

  if (hasNearLeft || hasNearRight) {
    score += 1;
  }

  return score;
}
