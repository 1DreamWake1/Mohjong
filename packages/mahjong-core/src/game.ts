import type { Action, MeldInfo, PlayerView } from "@mahjong/shared";

import { canHu } from "./hand.js";
import { standardRuleConfig, type RuleConfig } from "./rules.js";
import { compareTiles, isSameTileType, isSuited, type Tile } from "./tiles.js";
import { createSeededRandom, createShuffledWall, type RandomSource } from "./wall.js";

export type PlayerState = {
  seatIndex: number;
  username: string;
  handTiles: Tile[];
  discardTiles: Tile[];
  publicMelds: MeldInfo[];
  isBot: boolean;
};

export type PendingDiscard = {
  tile: Tile;
  fromSeatIndex: number;
  nextSeatIndex: number;
  respondentSeatIndexes: [number, number, number];
  respondentCursor: number;
};

export type MahjongGameState = {
  players: [PlayerState, PlayerState, PlayerState, PlayerState];
  wall: Tile[];
  currentTurn: number;
  dealerSeatIndex: number;
  phase: "playing" | "ended";
  rules: RuleConfig;
  winnerSeatIndex?: number;
  winningTile?: Tile;
  endReason?: "hu" | "draw";
  pendingDiscard?: PendingDiscard;
};

export type CreateGameOptions = {
  random?: RandomSource;
  seed?: number;
  rules?: RuleConfig;
};

export type ApplyActionResult =
  | { ok: true; state: MahjongGameState }
  | { ok: false; error: string; state: MahjongGameState };

export function createInitialGame(options: CreateGameOptions = {}): MahjongGameState {
  const random = options.random ?? (options.seed === undefined ? Math.random : createSeededRandom(options.seed));
  const wall = createShuffledWall(random);
  const players: [PlayerState, PlayerState, PlayerState, PlayerState] = [
    createPlayerState(0),
    createPlayerState(1),
    createPlayerState(2),
    createPlayerState(3)
  ];

  for (let round = 0; round < 13; round += 1) {
    for (const player of players) {
      drawTileIntoHand(player, wall);
    }
  }

  drawTileIntoHand(players[0], wall);

  for (const player of players) {
    player.handTiles.sort(compareTiles);
  }

  return {
    players,
    wall,
    currentTurn: 0,
    dealerSeatIndex: 0,
    phase: "playing",
    rules: options.rules ?? standardRuleConfig
  };
}

export function getLegalActions(state: MahjongGameState, seatIndex: number): Action[] {
  if (state.phase !== "playing" || state.currentTurn !== seatIndex) {
    return [];
  }

  if (state.pendingDiscard) {
    return getClaimActions(state, seatIndex);
  }

  const player = getPlayer(state, seatIndex);
  const actions: Action[] = player.handTiles.map((tile) => ({ type: "discard", tileId: tile.id }));
  const huResult = canHu(player.handTiles, state.rules);

  if (huResult.canHu) {
    actions.unshift({ type: "hu" });
  }

  return actions;
}

export function applyAction(state: MahjongGameState, seatIndex: number, action: Action): ApplyActionResult {
  if (state.phase !== "playing") {
    return { ok: false, error: "Game has ended", state };
  }

  if (state.currentTurn !== seatIndex) {
    return { ok: false, error: "Action is not from current turn player", state };
  }

  if (state.pendingDiscard) {
    return applyClaimAction(state, seatIndex, action);
  }

  if (action.type === "hu") {
    const player = getPlayer(state, seatIndex);
    const huResult = canHu(player.handTiles, state.rules);

    if (!huResult.canHu) {
      return { ok: false, error: "Hand cannot win", state };
    }

    const winningTile = player.handTiles.at(-1);

    return {
      ok: true,
      state: winningTile
        ? {
            ...state,
            phase: "ended",
            winnerSeatIndex: seatIndex,
            winningTile,
            endReason: "hu"
          }
        : {
            ...state,
            phase: "ended",
            winnerSeatIndex: seatIndex,
            endReason: "hu"
          }
    };
  }

  if (action.type !== "discard") {
    return { ok: false, error: `Unsupported action in current reducer: ${action.type}`, state };
  }

  if (!action.tileId) {
    return { ok: false, error: "Discard action must include tileId", state };
  }

  const nextState = cloneState(state);
  const player = getPlayer(nextState, seatIndex);
  const tileIndex = player.handTiles.findIndex((tile) => tile.id === action.tileId);

  if (tileIndex < 0) {
    return { ok: false, error: "Cannot discard a tile outside player's hand", state };
  }

  const [discardedTile] = player.handTiles.splice(tileIndex, 1);

  if (!discardedTile) {
    return { ok: false, error: "Discard tile lookup failed", state };
  }

  player.discardTiles.push(discardedTile);
  openClaimWindow(nextState, discardedTile, seatIndex);

  return { ok: true, state: nextState };
}

export function createPlayerView(state: MahjongGameState, seatIndex: number): PlayerView {
  const player = getPlayer(state, seatIndex);

  return {
    seatIndex,
    handTiles: [...player.handTiles].sort(compareTiles),
    otherPlayers: state.players
      .filter((otherPlayer) => otherPlayer.seatIndex !== seatIndex)
      .map((otherPlayer) => ({
        seatIndex: otherPlayer.seatIndex,
        username: otherPlayer.username,
        handTileCount: otherPlayer.handTiles.length,
        isBot: otherPlayer.isBot
      })),
    discardAreas: state.players.map((discardPlayer) => ({
      seatIndex: discardPlayer.seatIndex,
      tiles: discardPlayer.discardTiles
    })),
    publicMelds: state.players.flatMap((meldPlayer) => meldPlayer.publicMelds),
    currentTurn: state.currentTurn,
    availableActions: getLegalActions(state, seatIndex),
    phase: state.phase
  };
}

export function createEmptyPlayerView(seatIndex: number): PlayerView {
  return {
    seatIndex,
    handTiles: [],
    otherPlayers: [],
    discardAreas: [],
    publicMelds: [],
    currentTurn: 0,
    availableActions: [],
    phase: "waiting"
  };
}

function createPlayerState(seatIndex: number): PlayerState {
  return {
    seatIndex,
    username: `bot-${seatIndex + 1}`,
    handTiles: [],
    discardTiles: [],
    publicMelds: [],
    isBot: true
  };
}

function openClaimWindow(state: MahjongGameState, tile: Tile, fromSeatIndex: number): void {
  const nextSeatIndex = (fromSeatIndex + 1) % 4;

  state.pendingDiscard = {
    tile,
    fromSeatIndex,
    nextSeatIndex,
    respondentSeatIndexes: [nextSeatIndex, (fromSeatIndex + 2) % 4, (fromSeatIndex + 3) % 4],
    respondentCursor: 0
  };
  state.currentTurn = nextSeatIndex;
}

function getClaimActions(state: MahjongGameState, seatIndex: number): Action[] {
  const pendingDiscard = state.pendingDiscard;

  if (!pendingDiscard || pendingDiscard.respondentSeatIndexes[pendingDiscard.respondentCursor] !== seatIndex) {
    return [];
  }

  const player = getPlayer(state, seatIndex);
  const actions: Action[] = [{ type: "pass" }];
  const handWithDiscard = [...player.handTiles, pendingDiscard.tile];

  if (canHu(handWithDiscard, state.rules).canHu) {
    actions.unshift({ type: "hu", tileId: pendingDiscard.tile.id });
  }

  const sameTiles = player.handTiles.filter((tile) => isSameTileType(tile, pendingDiscard.tile));

  if (state.rules.allowGang && sameTiles.length >= 3) {
    actions.push({
      type: "gang",
      tileId: pendingDiscard.tile.id,
      tileIds: sameTiles.slice(0, 3).map((tile) => tile.id)
    });
  }

  if (state.rules.allowPeng && sameTiles.length >= 2) {
    actions.push({
      type: "peng",
      tileId: pendingDiscard.tile.id,
      tileIds: sameTiles.slice(0, 2).map((tile) => tile.id)
    });
  }

  if (state.rules.allowChi && seatIndex === pendingDiscard.nextSeatIndex) {
    actions.push(...getChiActions(player.handTiles, pendingDiscard.tile));
  }

  return actions;
}

function applyClaimAction(state: MahjongGameState, seatIndex: number, action: Action): ApplyActionResult {
  const pendingDiscard = state.pendingDiscard;

  if (!pendingDiscard) {
    return { ok: false, error: "No discard is waiting for claim", state };
  }

  if (pendingDiscard.respondentSeatIndexes[pendingDiscard.respondentCursor] !== seatIndex) {
    return { ok: false, error: "Player is not the current claim respondent", state };
  }

  if (action.type === "pass") {
    const nextState = cloneState(state);
    const nextPendingDiscard = nextState.pendingDiscard;

    if (!nextPendingDiscard) {
      return { ok: false, error: "No discard is waiting for claim", state };
    }

    nextPendingDiscard.respondentCursor += 1;

    if (nextPendingDiscard.respondentCursor >= nextPendingDiscard.respondentSeatIndexes.length) {
      const nextSeatIndex = nextPendingDiscard.nextSeatIndex;
      delete nextState.pendingDiscard;
      nextState.currentTurn = nextSeatIndex;
      drawOrEnd(nextState, nextSeatIndex);
      return { ok: true, state: nextState };
    }

    nextState.currentTurn = nextPendingDiscard.respondentSeatIndexes[nextPendingDiscard.respondentCursor] ?? nextState.currentTurn;
    return { ok: true, state: nextState };
  }

  if (action.type === "hu") {
    const player = getPlayer(state, seatIndex);
    const huResult = canHu([...player.handTiles, pendingDiscard.tile], state.rules);

    if (!huResult.canHu) {
      return { ok: false, error: "Claimed discard cannot complete a winning hand", state };
    }

    return {
      ok: true,
      state: {
        ...state,
        phase: "ended",
        winnerSeatIndex: seatIndex,
        winningTile: pendingDiscard.tile,
        endReason: "hu"
      }
    };
  }

  if (action.type !== "chi" && action.type !== "peng" && action.type !== "gang") {
    return { ok: false, error: `Unsupported claim action: ${action.type}`, state };
  }

  if (!action.tileIds || action.tileIds.length === 0) {
    return { ok: false, error: "Claim action must include tileIds", state };
  }

  const claimTileIds = action.tileIds;
  const legalAction = getClaimActions(state, seatIndex).find(
    (candidate) => candidate.type === action.type && haveSameTileIds(candidate.tileIds, claimTileIds)
  );

  if (!legalAction) {
    return { ok: false, error: "Illegal claim action", state };
  }

  const nextState = cloneState(state);
  const nextPendingDiscard = nextState.pendingDiscard;

  if (!nextPendingDiscard) {
    return { ok: false, error: "No discard is waiting for claim", state };
  }

  const player = getPlayer(nextState, seatIndex);
  const claimedTiles = removeTilesFromHand(player, claimTileIds);

  if (!claimedTiles) {
    return { ok: false, error: "Claim action references tiles outside player's hand", state };
  }

  removeDiscardedTile(nextState, nextPendingDiscard.fromSeatIndex, nextPendingDiscard.tile.id);
  player.publicMelds.push({
    type: action.type,
    ownerSeatIndex: seatIndex,
    tiles: [...claimedTiles, nextPendingDiscard.tile].sort(compareTiles),
    fromSeatIndex: nextPendingDiscard.fromSeatIndex
  });
  delete nextState.pendingDiscard;
  nextState.currentTurn = seatIndex;

  if (action.type === "gang") {
    drawOrEnd(nextState, seatIndex);
  }

  return { ok: true, state: nextState };
}

function getChiActions(handTiles: readonly Tile[], discardedTile: Tile): Action[] {
  if (!isSuited(discardedTile)) {
    return [];
  }

  const sequences: Array<[number, number]> = [
    [discardedTile.rank - 2, discardedTile.rank - 1],
    [discardedTile.rank - 1, discardedTile.rank + 1],
    [discardedTile.rank + 1, discardedTile.rank + 2]
  ];

  return sequences.flatMap(([firstRank, secondRank]) => {
    if (firstRank < 1 || secondRank > 9) {
      return [];
    }

    const firstTile = handTiles.find((tile) => tile.suit === discardedTile.suit && tile.rank === firstRank);
    const secondTile = handTiles.find((tile) => tile.suit === discardedTile.suit && tile.rank === secondRank);

    if (!firstTile || !secondTile) {
      return [];
    }

    return [
      {
        type: "chi" as const,
        tileId: discardedTile.id,
        tileIds: [firstTile.id, secondTile.id]
      }
    ];
  });
}

function drawOrEnd(state: MahjongGameState, seatIndex: number): void {
  if (state.wall.length === 0) {
    state.phase = "ended";
    state.endReason = "draw";
    return;
  }

  drawTileIntoHand(getPlayer(state, seatIndex), state.wall);
}

function removeTilesFromHand(player: PlayerState, tileIds: readonly string[]): Tile[] | undefined {
  const removedTiles: Tile[] = [];

  for (const tileId of tileIds) {
    const tileIndex = player.handTiles.findIndex((tile) => tile.id === tileId);

    if (tileIndex < 0) {
      return undefined;
    }

    const [tile] = player.handTiles.splice(tileIndex, 1);

    if (!tile) {
      return undefined;
    }

    removedTiles.push(tile);
  }

  return removedTiles;
}

function removeDiscardedTile(state: MahjongGameState, seatIndex: number, tileId: string): void {
  const player = getPlayer(state, seatIndex);
  const tileIndex = player.discardTiles.findIndex((tile) => tile.id === tileId);

  if (tileIndex >= 0) {
    player.discardTiles.splice(tileIndex, 1);
  }
}

function haveSameTileIds(left: readonly string[] | undefined, right: readonly string[]): boolean {
  if (!left || left.length !== right.length) {
    return false;
  }

  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();

  return sortedLeft.every((tileId, index) => tileId === sortedRight[index]);
}

function drawTileIntoHand(player: PlayerState, wall: Tile[]): void {
  const tile = wall.pop();

  if (!tile) {
    throw new Error("Cannot draw from an empty wall");
  }

  player.handTiles.push(tile);
}

function getPlayer(state: MahjongGameState, seatIndex: number): PlayerState {
  const player = state.players[seatIndex];

  if (!player) {
    throw new Error(`Unknown seat index: ${seatIndex}`);
  }

  return player;
}

function cloneState(state: MahjongGameState): MahjongGameState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      handTiles: [...player.handTiles],
      discardTiles: [...player.discardTiles],
      publicMelds: player.publicMelds.map((meld) => ({
        ...meld,
        tiles: [...meld.tiles]
      }))
    })) as [PlayerState, PlayerState, PlayerState, PlayerState],
    wall: [...state.wall],
    ...(state.pendingDiscard
      ? {
          pendingDiscard: {
            ...state.pendingDiscard,
            respondentSeatIndexes: [...state.pendingDiscard.respondentSeatIndexes] as [number, number, number]
          }
        }
      : {})
  };
}
