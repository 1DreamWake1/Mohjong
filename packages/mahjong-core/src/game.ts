import type { Action, MeldInfo, PlayerView, WinType } from "@mahjong/shared";

import {
  getClaimPriorityConfig,
  getRuleConfigValidationErrors,
  getRuleActions,
  shouldEndOnEmptyWall,
  standardRuleConfig,
  type RuleConfig
} from "./rules.js";
import { calculateScore, meetsMinimumFan, type ScoreResult } from "./scoring.js";
import { compareTiles, isSameTileType, isSuited, type Tile } from "./tiles.js";
import { createSeededRandom, createShuffledWall, type RandomSource } from "./wall.js";

export type PlayerState = {
  seatIndex: number;
  username: string;
  handTiles: Tile[];
  discardTiles: Tile[];
  publicMelds: MeldInfo[];
  isBot: boolean;
  lastDrawnTileId?: string;
};

export type PendingDiscard = {
  tile: Tile;
  fromSeatIndex: number;
  nextSeatIndex: number;
  respondentSeatIndexes: [number, number, number];
  respondentCursor: number;
  passedSeatIndexes: number[];
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
  winType?: WinType;
  score?: ScoreResult;
  endReason?: "hu" | "draw";
  lastDiscardedTileId?: string;
  pendingDiscard?: PendingDiscard;
};

export type CreateGameOptions = {
  players?: readonly {
    isBot: boolean;
    username: string;
  }[];
  random?: RandomSource;
  seed?: number;
  rules?: RuleConfig;
};

export type ApplyActionResult =
  | { ok: true; state: MahjongGameState }
  | { ok: false; error: string; state: MahjongGameState };

export function createInitialGame(options: CreateGameOptions = {}): MahjongGameState {
  const random =
    options.random ?? (options.seed === undefined ? Math.random : createSeededRandom(options.seed));
  const rules = options.rules ?? standardRuleConfig;
  const ruleErrors = getRuleConfigValidationErrors(rules);
  if (ruleErrors.length > 0) {
    throw new Error(`Invalid rule config: ${ruleErrors.join("; ")}`);
  }
  const wall = createShuffledWall(random, rules);
  const players: [PlayerState, PlayerState, PlayerState, PlayerState] = [
    createPlayerState(0, options.players?.[0]),
    createPlayerState(1, options.players?.[1]),
    createPlayerState(2, options.players?.[2]),
    createPlayerState(3, options.players?.[3])
  ];

  for (let round = 0; round < 13; round += 1) {
    for (const player of players) {
      drawTileIntoHand(player, wall);
    }
  }

  drawTileIntoHand(players[0], wall);

  for (const player of players) {
    player.handTiles.sort(compareTiles);
    delete player.lastDrawnTileId;
  }

  return {
    players,
    wall,
    currentTurn: 0,
    dealerSeatIndex: 0,
    phase: "playing",
    rules
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
  const discardActions: Action[] = player.handTiles.map((tile) => ({
    type: "discard",
    tileId: tile.id
  }));
  const actions: Action[] = [...getTurnGangActions(state, seatIndex), ...discardActions];
  const score = calculateScore(player.handTiles, state.rules, {
    publicMelds: player.publicMelds
  });

  if (meetsMinimumFan(score, state.rules)) {
    actions.unshift({ type: "hu" });
  }

  return actions;
}

export function applyAction(
  state: MahjongGameState,
  seatIndex: number,
  action: Action
): ApplyActionResult {
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
    const score = calculateScore(player.handTiles, state.rules, {
      publicMelds: player.publicMelds
    });

    if (!score.canHu) {
      return { ok: false, error: "Hand cannot win", state };
    }
    if (!meetsMinimumFan(score, state.rules)) {
      return { ok: false, error: "Hand does not meet minimum fan", state };
    }

    const winningTile =
      player.lastDrawnTileId === undefined
        ? player.handTiles.at(-1)
        : player.handTiles.find((tile) => tile.id === player.lastDrawnTileId);
    return {
      ok: true,
      state: winningTile
        ? {
            ...state,
            phase: "ended",
            winnerSeatIndex: seatIndex,
            winningTile,
            winType: "selfDraw",
            score,
            endReason: "hu"
          }
        : {
            ...state,
            phase: "ended",
            winnerSeatIndex: seatIndex,
            winType: "selfDraw",
            score,
            endReason: "hu"
          }
    };
  }

  if (action.type === "gang") {
    return applyTurnGangAction(state, seatIndex, action);
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
  delete player.lastDrawnTileId;
  nextState.lastDiscardedTileId = discardedTile.id;
  openClaimWindow(nextState, discardedTile, seatIndex);

  return { ok: true, state: nextState };
}

export function createPlayerView(state: MahjongGameState, seatIndex: number): PlayerView {
  const player = getPlayer(state, seatIndex);

  const view: PlayerView = {
    availableActions: getLegalActions(state, seatIndex),
    currentTurn: state.currentTurn,
    discardAreas: state.players.map((discardPlayer) => ({
      seatIndex: discardPlayer.seatIndex,
      tiles: discardPlayer.discardTiles
    })),
    eventMessages: [
      {
        createdAt: new Date(0).toISOString(),
        id: state.phase === "ended" ? "game-ended" : "game-playing",
        text: state.phase === "ended" ? "牌局结束" : "牌局进行中"
      }
    ],
    handTiles: [...player.handTiles].sort(compareTiles),
    otherPlayers: state.players
      .filter((otherPlayer) => otherPlayer.seatIndex !== seatIndex)
      .map((otherPlayer) => ({
        handTileCount: otherPlayer.handTiles.length,
        isBot: otherPlayer.isBot,
        seatIndex: otherPlayer.seatIndex,
        username: otherPlayer.username
      })),
    phase: state.phase,
    publicMelds: state.players.flatMap((meldPlayer) => meldPlayer.publicMelds),
    roomId: "core-game",
    seatIndex,
    username: player.username,
    wallTileCount: state.wall.length,
    ...(state.lastDiscardedTileId ? { lastDiscardedTileId: state.lastDiscardedTileId } : {}),
    ...(player.lastDrawnTileId ? { lastDrawnTileId: player.lastDrawnTileId } : {})
  };

  const result =
    state.phase === "ended" && state.endReason
      ? {
          endReason: state.endReason,
          fanTotal: state.score?.fanTotal ?? 0,
          fans: state.score?.fans.map((fan) => ({ name: fan.name, value: fan.value })) ?? [],
          totalPoints: state.score?.totalPoints ?? 0,
          ...(state.endReason === "hu" && state.winType ? { winType: state.winType } : {}),
          ...(state.endReason === "hu" && state.winningTile
            ? { winningTile: state.winningTile }
            : {})
        }
      : undefined;

  const viewWithResult = result ? { ...view, result } : view;

  return state.winnerSeatIndex === undefined
    ? viewWithResult
    : { ...viewWithResult, winnerSeatIndex: state.winnerSeatIndex };
}

export function createEmptyPlayerView(seatIndex: number): PlayerView {
  return {
    availableActions: [],
    currentTurn: 0,
    discardAreas: [],
    eventMessages: [],
    handTiles: [],
    otherPlayers: [],
    phase: "waiting",
    publicMelds: [],
    roomId: "",
    seatIndex,
    username: "",
    wallTileCount: 0
  };
}

function createPlayerState(
  seatIndex: number,
  options?: { isBot: boolean; username: string }
): PlayerState {
  return {
    seatIndex,
    username: options?.username ?? `bot-${seatIndex + 1}`,
    handTiles: [],
    discardTiles: [],
    publicMelds: [],
    isBot: options?.isBot ?? true
  };
}

function openClaimWindow(state: MahjongGameState, tile: Tile, fromSeatIndex: number): void {
  const nextSeatIndex = (fromSeatIndex + 1) % 4;

  state.pendingDiscard = {
    tile,
    fromSeatIndex,
    nextSeatIndex,
    respondentSeatIndexes: [nextSeatIndex, (fromSeatIndex + 2) % 4, (fromSeatIndex + 3) % 4],
    respondentCursor: 0,
    passedSeatIndexes: []
  };
  const respondentSeatIndex = findBestRespondentSeatIndex(state);
  if (respondentSeatIndex === undefined) {
    delete state.pendingDiscard;
    state.currentTurn = nextSeatIndex;
    drawOrEnd(state, nextSeatIndex);
    return;
  }

  state.currentTurn = respondentSeatIndex;
}

function getClaimActions(state: MahjongGameState, seatIndex: number): Action[] {
  const pendingDiscard = state.pendingDiscard;

  if (
    !pendingDiscard ||
    pendingDiscard.passedSeatIndexes.includes(seatIndex) ||
    findBestRespondentSeatIndex(state) !== seatIndex
  ) {
    return [];
  }

  return filterHighestPriorityClaimActions(state, [
    { type: "pass" },
    ...getAvailableClaimActionsForSeat(state, seatIndex)
  ]);
}

function getAvailableClaimActionsForSeat(state: MahjongGameState, seatIndex: number): Action[] {
  const pendingDiscard = state.pendingDiscard;

  if (!pendingDiscard || pendingDiscard.passedSeatIndexes.includes(seatIndex)) {
    return [];
  }

  const player = getPlayer(state, seatIndex);
  const actions: Action[] = [];
  const handWithDiscard = [...player.handTiles, pendingDiscard.tile];
  const sameTiles = player.handTiles.filter((tile) => isSameTileType(tile, pendingDiscard.tile));

  if (
    meetsMinimumFan(
      calculateScore(handWithDiscard, state.rules, { publicMelds: player.publicMelds }),
      state.rules
    )
  ) {
    actions.push({ type: "hu", tileId: pendingDiscard.tile.id });
  }

  const allowedActions = getRuleActions(state.rules);
  if (allowedActions.gang && sameTiles.length >= 3) {
    actions.push({
      type: "gang",
      tileId: pendingDiscard.tile.id,
      tileIds: sameTiles.slice(0, 3).map((tile) => tile.id)
    });
  }

  if (allowedActions.peng && sameTiles.length >= 2) {
    actions.push({
      type: "peng",
      tileId: pendingDiscard.tile.id,
      tileIds: sameTiles.slice(0, 2).map((tile) => tile.id)
    });
  }

  if (allowedActions.chi && seatIndex === pendingDiscard.nextSeatIndex) {
    actions.push(...getChiActions(player.handTiles, pendingDiscard.tile));
  }

  return actions;
}

function applyClaimAction(
  state: MahjongGameState,
  seatIndex: number,
  action: Action
): ApplyActionResult {
  const pendingDiscard = state.pendingDiscard;

  if (!pendingDiscard) {
    return { ok: false, error: "No discard is waiting for claim", state };
  }

  const bestRespondentSeatIndex = findBestRespondentSeatIndex(state);

  if (bestRespondentSeatIndex !== undefined && bestRespondentSeatIndex !== seatIndex) {
    return { ok: false, error: "Player is not the current claim respondent", state };
  }

  if (action.type === "pass") {
    const nextState = cloneState(state);
    const nextPendingDiscard = nextState.pendingDiscard;

    if (!nextPendingDiscard) {
      return { ok: false, error: "No discard is waiting for claim", state };
    }

    nextPendingDiscard.passedSeatIndexes.push(seatIndex);

    const nextRespondentSeatIndex = findBestRespondentSeatIndex(nextState);

    if (nextRespondentSeatIndex === undefined) {
      const nextSeatIndex = nextPendingDiscard.nextSeatIndex;
      delete nextState.pendingDiscard;
      nextState.currentTurn = nextSeatIndex;
      drawOrEnd(nextState, nextSeatIndex);
      return { ok: true, state: nextState };
    }

    nextState.currentTurn = nextRespondentSeatIndex;
    return { ok: true, state: nextState };
  }

  if (action.type === "hu") {
    const player = getPlayer(state, seatIndex);
    const score = calculateScore([...player.handTiles, pendingDiscard.tile], state.rules, {
      publicMelds: player.publicMelds
    });

    if (!score.canHu) {
      return { ok: false, error: "Claimed discard cannot complete a winning hand", state };
    }
    if (!meetsMinimumFan(score, state.rules)) {
      return { ok: false, error: "Claimed discard does not meet minimum fan", state };
    }

    return {
      ok: true,
      state: {
        ...state,
        phase: "ended",
        winnerSeatIndex: seatIndex,
        winningTile: pendingDiscard.tile,
        winType: "discard",
        score,
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
    (candidate) =>
      candidate.type === action.type && haveSameTileIds(candidate.tileIds, claimTileIds)
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

function getTurnGangActions(state: MahjongGameState, seatIndex: number): Action[] {
  const player = getPlayer(state, seatIndex);
  const actions: Action[] = [];
  const handGroups = new Map<string, Tile[]>();

  for (const tile of player.handTiles) {
    const tiles = handGroups.get(tile.code) ?? [];
    tiles.push(tile);
    handGroups.set(tile.code, tiles);
  }

  if (getRuleActions(state.rules).gang) {
    for (const tiles of handGroups.values()) {
      if (tiles.length === 4) {
        actions.push({ type: "gang", tileIds: tiles.map((tile) => tile.id) });
      }
    }

    for (const meld of player.publicMelds) {
      if (meld.type !== "peng") {
        continue;
      }

      const firstMeldTile = meld.tiles[0];
      const handTile = firstMeldTile
        ? player.handTiles.find((tile) => isSameTileType(tile, firstMeldTile as Tile))
        : undefined;

      if (handTile) {
        actions.push({ type: "gang", tileIds: [handTile.id] });
      }
    }
  }

  return actions;
}

function applyTurnGangAction(
  state: MahjongGameState,
  seatIndex: number,
  action: Action
): ApplyActionResult {
  if (!action.tileIds || action.tileIds.length === 0) {
    return { ok: false, error: "Gang action must include tileIds", state };
  }

  const gangTileIds = action.tileIds;
  const legalAction = getTurnGangActions(state, seatIndex).find((candidate) =>
    haveSameTileIds(candidate.tileIds, gangTileIds)
  );

  if (!legalAction) {
    return { ok: false, error: "Illegal gang action", state };
  }

  const nextState = cloneState(state);
  const player = getPlayer(nextState, seatIndex);
  const removedTiles = removeTilesFromHand(player, gangTileIds);

  if (!removedTiles) {
    return { ok: false, error: "Gang action references tiles outside player's hand", state };
  }

  if (removedTiles.length === 4) {
    player.publicMelds.push({
      type: "gang",
      ownerSeatIndex: seatIndex,
      tiles: removedTiles.sort(compareTiles)
    });
  } else if (removedTiles.length === 1) {
    const tile = removedTiles[0];
    const meld = tile
      ? player.publicMelds.find(
          (candidate) =>
            candidate.type === "peng" &&
            candidate.tiles.some((meldTile) => isSameTileType(meldTile as Tile, tile))
        )
      : undefined;

    if (!tile || !meld) {
      return { ok: false, error: "Added gang requires an existing peng meld", state };
    }

    meld.type = "gang";
    meld.tiles = [...meld.tiles, tile].sort((a, b) => compareTiles(a as Tile, b as Tile));
  }

  drawOrEnd(nextState, seatIndex);
  return { ok: true, state: nextState };
}

function findBestRespondentSeatIndex(state: MahjongGameState): number | undefined {
  const pendingDiscard = state.pendingDiscard;

  if (!pendingDiscard) {
    return undefined;
  }

  let bestSeatIndex: number | undefined;
  let bestPriority = 0;

  for (const seatIndex of pendingDiscard.respondentSeatIndexes) {
    const priority = Math.max(
      0,
      ...getAvailableClaimActionsForSeat(state, seatIndex).map((action) =>
        getClaimPriority(state, action)
      )
    );

    if (priority > bestPriority) {
      bestSeatIndex = seatIndex;
      bestPriority = priority;
    }
  }

  return bestSeatIndex;
}

function filterHighestPriorityClaimActions(state: MahjongGameState, actions: Action[]): Action[] {
  const maxPriority = Math.max(0, ...actions.map((action) => getClaimPriority(state, action)));

  return actions.filter(
    (action) => action.type === "pass" || getClaimPriority(state, action) === maxPriority
  );
}

function getClaimPriority(state: MahjongGameState, action: Action): number {
  if (
    action.type !== "hu" &&
    action.type !== "peng" &&
    action.type !== "gang" &&
    action.type !== "chi"
  ) {
    return 0;
  }
  return getClaimPriorityConfig(state.rules)[action.type];
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

    const firstTile = handTiles.find(
      (tile) => tile.suit === discardedTile.suit && tile.rank === firstRank
    );
    const secondTile = handTiles.find(
      (tile) => tile.suit === discardedTile.suit && tile.rank === secondRank
    );

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
  if (state.wall.length === 0 && shouldEndOnEmptyWall(state.rules)) {
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
  player.lastDrawnTileId = tile.id;
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
            respondentSeatIndexes: [...state.pendingDiscard.respondentSeatIndexes] as [
              number,
              number,
              number
            ],
            passedSeatIndexes: [...state.pendingDiscard.passedSeatIndexes]
          }
        }
      : {})
  };
}
