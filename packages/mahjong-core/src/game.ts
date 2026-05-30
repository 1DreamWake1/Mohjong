import type { Action, PlayerView } from "@mahjong/shared";

import { canHu } from "./hand.js";
import { standardRuleConfig, type RuleConfig } from "./rules.js";
import { compareTiles, type Tile } from "./tiles.js";
import { createSeededRandom, createShuffledWall, type RandomSource } from "./wall.js";

export type PlayerState = {
  seatIndex: number;
  username: string;
  handTiles: Tile[];
  discardTiles: Tile[];
  isBot: boolean;
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
  advanceTurn(nextState);

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
    publicMelds: [],
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

function advanceTurn(state: MahjongGameState): void {
  const nextSeatIndex = (state.currentTurn + 1) % 4;

  if (state.wall.length === 0) {
    state.phase = "ended";
    state.endReason = "draw";
    state.currentTurn = nextSeatIndex;
    return;
  }

  state.currentTurn = nextSeatIndex;
  drawTileIntoHand(getPlayer(state, nextSeatIndex), state.wall);
}

function createPlayerState(seatIndex: number): PlayerState {
  return {
    seatIndex,
    username: `bot-${seatIndex + 1}`,
    handTiles: [],
    discardTiles: [],
    isBot: true
  };
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
      discardTiles: [...player.discardTiles]
    })) as [PlayerState, PlayerState, PlayerState, PlayerState],
    wall: [...state.wall]
  };
}
