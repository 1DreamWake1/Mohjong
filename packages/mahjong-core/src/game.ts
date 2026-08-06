import type {
  Action,
  GameSettlementTransfer,
  MeldInfo,
  PlayerView,
  TileSuit,
  WinContext,
  WinType
} from "@mahjong/shared";

import {
  getClaimPriorityConfig,
  getRuleConfigValidationErrors,
  getRuleActions,
  getSichuanRuleOptions,
  shouldEndOnEmptyWall,
  standardRuleConfig,
  type RuleConfig
} from "./rules.js";
import { calculateScore, meetsMinimumFan, type ScoreResult } from "./scoring.js";
import {
  compareTiles,
  createTile,
  isSameTileType,
  isSuited,
  tileDefinitions,
  type Tile
} from "./tiles.js";
import { createSeededRandom, createShuffledWall, type RandomSource } from "./wall.js";

export type PlayerState = {
  seatIndex: number;
  username: string;
  handTiles: Tile[];
  discardTiles: Tile[];
  publicMelds: MeldInfo[];
  isBot: boolean;
  hasWon?: boolean;
  lastDrawnTileId?: string;
};

export type PendingDiscard = {
  tile: Tile;
  fromSeatIndex: number;
  nextSeatIndex: number;
  respondentSeatIndexes: [number, number, number];
  respondentCursor: number;
  passedSeatIndexes: number[];
  huSeatIndexes?: number[];
  huCursor?: number;
};

export type PendingGang = {
  gangTile: Tile;
  ownerSeatIndex: number;
  respondentSeatIndexes: number[];
  respondentCursor: number;
  passedSeatIndexes: number[];
};

export type WinRecord = {
  score: ScoreResult;
  winnerSeatIndex: number;
  winType: WinType;
  winContext?: WinContext;
  winningTile?: Tile;
};

export type MahjongGameState = {
  players: [PlayerState, PlayerState, PlayerState, PlayerState];
  wall: Tile[];
  currentTurn: number;
  dealerSeatIndex: number;
  phase: "choose-missing-suit" | "ended" | "exchange-three" | "playing";
  rules: RuleConfig;
  exchangeThreeSelections?: Partial<Record<number, string[]>>;
  missingSuits?: Partial<Record<number, Extract<TileSuit, "bamboo" | "characters" | "dots">>>;
  wonSeatIndexes?: number[];
  winRecords?: WinRecord[];
  gangScores?: [number, number, number, number];
  settlementScores?: [number, number, number, number];
  settlementTransfers?: GameSettlementTransfer[];
  gangDrawSeatIndex?: number;
  gangDiscardSeatIndex?: number;
  winnerSeatIndex?: number;
  winningTile?: Tile;
  winType?: WinType;
  score?: ScoreResult;
  endReason?: "hu" | "draw";
  lastDiscardedTileId?: string;
  pendingDiscard?: PendingDiscard;
  pendingGang?: PendingGang;
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

  if (!rules.name.startsWith("sichuan")) {
    drawTileIntoHand(players[0], wall);
  }

  for (const player of players) {
    player.handTiles.sort(compareTiles);
    delete player.lastDrawnTileId;
  }

  return {
    players,
    wall,
    currentTurn: 0,
    dealerSeatIndex: 0,
    phase: rules.name.startsWith("sichuan") ? "exchange-three" : "playing",
    rules,
    ...(rules.name.startsWith("sichuan") ? { exchangeThreeSelections: {}, missingSuits: {} } : {}),
    ...(rules.name.startsWith("sichuan")
      ? {
          gangScores: [0, 0, 0, 0] as [number, number, number, number],
          wonSeatIndexes: [],
          winRecords: []
        }
      : {})
  };
}

export function getLegalActions(state: MahjongGameState, seatIndex: number): Action[] {
  if (state.phase === "exchange-three") {
    return getExchangeThreeActions(state, seatIndex);
  }

  if (state.phase === "choose-missing-suit") {
    return getMissingSuitActions(state, seatIndex);
  }

  if (state.phase !== "playing" || state.currentTurn !== seatIndex) {
    return [];
  }

  if (getPlayer(state, seatIndex).hasWon) {
    return [];
  }

  if (state.pendingGang) {
    return getGangClaimActions(state, seatIndex);
  }

  if (state.pendingDiscard) {
    return getClaimActions(state, seatIndex);
  }

  const player = getPlayer(state, seatIndex);
  const discardTiles = getDiscardableTiles(state, seatIndex);
  const discardActions: Action[] = discardTiles.map((tile) => ({
    type: "discard",
    tileId: tile.id
  }));
  const actions: Action[] = [...getTurnGangActions(state, seatIndex), ...discardActions];
  const score = calculateScore(player.handTiles, state.rules, {
    publicMelds: player.publicMelds
  });

  if (meetsMinimumFan(score, state.rules) && !hasMissingSuitTiles(state, seatIndex)) {
    actions.unshift({ type: "hu" });
  }

  return actions;
}

export function applyAction(
  state: MahjongGameState,
  seatIndex: number,
  action: Action
): ApplyActionResult {
  if (state.phase === "exchange-three" || state.phase === "choose-missing-suit") {
    return applySichuanOpeningAction(state, seatIndex, action);
  }

  if (state.phase !== "playing") {
    return { ok: false, error: "Game has ended", state };
  }

  if (state.currentTurn !== seatIndex) {
    return { ok: false, error: "Action is not from current turn player", state };
  }

  if (state.pendingGang) {
    return applyGangClaimAction(state, seatIndex, action);
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
    if (hasMissingSuitTiles(state, seatIndex)) {
      return { ok: false, error: "Must discard all missing-suit tiles before winning", state };
    }
    if (!meetsMinimumFan(score, state.rules)) {
      return { ok: false, error: "Hand does not meet minimum fan", state };
    }

    const winningTile =
      player.lastDrawnTileId === undefined
        ? player.handTiles.at(-1)
        : player.handTiles.find((tile) => tile.id === player.lastDrawnTileId);
    if (state.rules.name.startsWith("sichuan")) {
      return completeSichuanWin(
        state,
        seatIndex,
        winningTile,
        "selfDraw",
        score,
        state.gangDrawSeatIndex === seatIndex ? "gangDraw" : undefined
      );
    }

    return {
      ok: true,
      state: winningTile
        ? {
            ...state,
            phase: "ended",
            winnerSeatIndex: seatIndex,
            winningTile,
            winType: "selfDraw",
            ...(state.gangDrawSeatIndex === seatIndex ? { winContext: "gangDraw" as const } : {}),
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

  if (!getDiscardableTiles(state, seatIndex).some((tile) => tile.id === action.tileId)) {
    return { ok: false, error: "Must discard the selected missing-suit tiles first", state };
  }

  const [discardedTile] = player.handTiles.splice(tileIndex, 1);

  if (!discardedTile) {
    return { ok: false, error: "Discard tile lookup failed", state };
  }

  player.discardTiles.push(discardedTile);
  delete player.lastDrawnTileId;
  nextState.lastDiscardedTileId = discardedTile.id;
  if (nextState.gangDrawSeatIndex === seatIndex) {
    delete nextState.gangDrawSeatIndex;
    nextState.gangDiscardSeatIndex = seatIndex;
  }
  openClaimWindow(nextState, discardedTile, seatIndex);

  return { ok: true, state: nextState };
}

export function createPlayerView(state: MahjongGameState, seatIndex: number): PlayerView {
  const player = getPlayer(state, seatIndex);
  const readyResults = getReadyResults(state);

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
        username: otherPlayer.username,
        ...(state.gangScores ? { gangPoints: state.gangScores[otherPlayer.seatIndex] } : {}),
        ...(otherPlayer.hasWon ? { hasWon: true } : {})
      })),
    phase: state.phase,
    ...(player.hasWon ? { hasWon: true } : {}),
    ...(state.gangScores ? { gangPoints: state.gangScores[seatIndex] } : {}),
    ...(state.settlementScores
      ? { settlementScores: [...state.settlementScores] as [number, number, number, number] }
      : {}),
    ...(state.settlementTransfers ? { settlementTransfers: [...state.settlementTransfers] } : {}),
    ...(readyResults.length > 0 ? { readyResults } : {}),
    publicMelds: state.players.flatMap((meldPlayer) => meldPlayer.publicMelds),
    roomId: "core-game",
    seatIndex,
    username: player.username,
    wallTileCount: state.wall.length,
    ...(state.lastDiscardedTileId ? { lastDiscardedTileId: state.lastDiscardedTileId } : {}),
    ...(player.lastDrawnTileId ? { lastDrawnTileId: player.lastDrawnTileId } : {}),
    ...(state.missingSuits?.[seatIndex] ? { missingSuit: state.missingSuits[seatIndex] } : {}),
    ...(getWaitingTiles(state, seatIndex).length > 0
      ? { waitingTiles: getWaitingTiles(state, seatIndex) }
      : {}),
    ...(state.winRecords && state.winRecords.length > 0
      ? {
          winnerResults: state.winRecords.map((record) => ({
            endReason: "hu" as const,
            fans: record.score.fans.map((fan) => ({ name: fan.name, value: fan.value })),
            fanTotal: record.score.fanTotal,
            totalPoints: record.score.totalPoints,
            winType: record.winType,
            ...(record.winContext ? { winContext: record.winContext } : {}),
            winnerSeatIndex: record.winnerSeatIndex,
            ...(record.winningTile ? { winningTile: record.winningTile } : {})
          }))
        }
      : {})
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
            : {}),
          ...(state.settlementScores
            ? { settlementScores: [...state.settlementScores] as [number, number, number, number] }
            : {}),
          ...(state.settlementTransfers
            ? { settlementTransfers: [...state.settlementTransfers] }
            : {})
        }
      : undefined;

  const viewWithResult = result ? { ...view, result } : view;

  return state.winnerSeatIndex === undefined
    ? viewWithResult
    : { ...viewWithResult, winnerSeatIndex: state.winnerSeatIndex };
}

function getReadyResults(
  state: MahjongGameState
): Array<{ maxFanTotal: number; maxPoints: number; seatIndex: number; waitingTiles: Tile[] }> {
  if (state.phase !== "ended" || !state.rules.name.startsWith("sichuan")) {
    return [];
  }

  return state.players.flatMap((player) => {
    const waitingScores = getWaitingTileScores(state, player.seatIndex);
    return waitingScores.length > 0
      ? [
          {
            maxFanTotal: Math.max(...waitingScores.map((result) => result.fanTotal)),
            maxPoints: Math.max(...waitingScores.map((result) => result.totalPoints)),
            seatIndex: player.seatIndex,
            waitingTiles: waitingScores.map((result) => result.tile)
          }
        ]
      : [];
  });
}

export function getWaitingTiles(state: MahjongGameState, seatIndex: number): Tile[] {
  return getWaitingTileScores(state, seatIndex).map((result) => result.tile);
}

export type WaitingTileScore = {
  fanTotal: number;
  tile: Tile;
  totalPoints: number;
};

export function getWaitingTileScores(
  state: MahjongGameState,
  seatIndex: number
): WaitingTileScore[] {
  if (state.phase !== "ended" || !state.rules.name.startsWith("sichuan")) {
    return [];
  }

  const player = getPlayer(state, seatIndex);
  if (player.hasWon) {
    return [];
  }

  return tileDefinitions.flatMap((definition) => {
    const tile = createTile(definition.code, 0);
    const score = calculateScore([...player.handTiles, tile], state.rules, {
      publicMelds: player.publicMelds
    });
    return score.canHu && meetsMinimumFan(score, state.rules)
      ? [{ fanTotal: score.fanTotal, tile, totalPoints: score.totalPoints }]
      : [];
  });
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

type SichuanSuit = Extract<TileSuit, "bamboo" | "characters" | "dots">;

const sichuanSuits: readonly SichuanSuit[] = ["characters", "dots", "bamboo"];

function getExchangeThreeActions(state: MahjongGameState, seatIndex: number): Action[] {
  if (state.exchangeThreeSelections?.[seatIndex]) {
    return [];
  }

  const player = getPlayer(state, seatIndex);
  const actions: Action[] = [];

  for (let firstIndex = 0; firstIndex < player.handTiles.length - 2; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < player.handTiles.length - 1;
      secondIndex += 1
    ) {
      for (
        let thirdIndex = secondIndex + 1;
        thirdIndex < player.handTiles.length;
        thirdIndex += 1
      ) {
        const tiles = [
          player.handTiles[firstIndex],
          player.handTiles[secondIndex],
          player.handTiles[thirdIndex]
        ] as [Tile, Tile, Tile];
        if (tiles.every((tile) => tile && tile.suit === tiles[0]?.suit && isSuited(tile))) {
          actions.push({ type: "exchangeThree", tileIds: tiles.map((tile) => tile.id) });
        }
      }
    }
  }

  return actions;
}

function getMissingSuitActions(state: MahjongGameState, seatIndex: number): Action[] {
  if (state.missingSuits?.[seatIndex]) {
    return [];
  }

  return sichuanSuits.map((suit) => ({ type: "chooseMissingSuit" as const, suit }));
}

function getDiscardableTiles(state: MahjongGameState, seatIndex: number): Tile[] {
  const player = getPlayer(state, seatIndex);
  const missingSuit = state.missingSuits?.[seatIndex];
  if (!missingSuit) return player.handTiles;

  const missingSuitTiles = player.handTiles.filter((tile) => tile.suit === missingSuit);
  return missingSuitTiles.length > 0 ? missingSuitTiles : player.handTiles;
}

function hasMissingSuitTiles(
  state: MahjongGameState,
  seatIndex: number,
  handTiles = getPlayer(state, seatIndex).handTiles
): boolean {
  const missingSuit = state.missingSuits?.[seatIndex];
  return missingSuit !== undefined && handTiles.some((tile) => tile.suit === missingSuit);
}

function applySichuanOpeningAction(
  state: MahjongGameState,
  seatIndex: number,
  action: Action
): ApplyActionResult {
  if (state.phase === "exchange-three") {
    if (action.type !== "exchangeThree" || !action.tileIds) {
      return { ok: false, error: "Exchange-three phase requires three tiles", state };
    }

    const legalAction = getExchangeThreeActions(state, seatIndex).find((candidate) =>
      haveSameTileIds(candidate.tileIds, action.tileIds ?? [])
    );
    if (!legalAction || action.tileIds.length !== 3) {
      return {
        ok: false,
        error: "Exchange-three action must select three tiles of one suit",
        state
      };
    }

    const nextState = cloneState(state);
    nextState.exchangeThreeSelections = {
      ...nextState.exchangeThreeSelections,
      [seatIndex]: [...action.tileIds]
    };

    if (!allSeatsHaveSelection(nextState.exchangeThreeSelections)) {
      return { ok: true, state: nextState };
    }

    const selectedTiles = nextState.players.map((player, currentSeatIndex) => {
      const selectedIds = nextState.exchangeThreeSelections?.[currentSeatIndex] ?? [];
      const tiles = removeTilesFromHand(player, selectedIds);
      if (!tiles || tiles.length !== 3) {
        throw new Error("Exchange-three selection references missing tiles");
      }
      return tiles;
    });

    nextState.players.forEach((player, currentSeatIndex) => {
      const incomingSeatIndex = (currentSeatIndex + 3) % 4;
      player.handTiles.push(...(selectedTiles[incomingSeatIndex] ?? []));
      player.handTiles.sort(compareTiles);
    });
    nextState.phase = "choose-missing-suit";
    nextState.currentTurn = 0;
    return { ok: true, state: nextState };
  }

  if (state.phase !== "choose-missing-suit") {
    return { ok: false, error: "Sichuan opening phase is not active", state };
  }
  if (action.type !== "chooseMissingSuit" || !isSichuanSuit(action.suit)) {
    return { ok: false, error: "Choose a missing suit before playing", state };
  }

  const nextState = cloneState(state);
  nextState.missingSuits = {
    ...nextState.missingSuits,
    [seatIndex]: action.suit
  };
  if (allSeatsHaveSelection(nextState.missingSuits)) {
    nextState.phase = "playing";
    nextState.currentTurn = nextState.dealerSeatIndex;
    drawOrEnd(nextState, nextState.dealerSeatIndex);
  }
  return { ok: true, state: nextState };
}

function allSeatsHaveSelection<T>(selections: Partial<Record<number, T>> | undefined): boolean {
  return (
    selections !== undefined &&
    [0, 1, 2, 3].every((seatIndex) => selections[seatIndex] !== undefined)
  );
}

function isSichuanSuit(suit: TileSuit | undefined): suit is SichuanSuit {
  return suit === "characters" || suit === "dots" || suit === "bamboo";
}

function completeSichuanWin(
  state: MahjongGameState,
  seatIndex: number,
  winningTile: Tile | undefined,
  winType: WinType,
  score: ScoreResult,
  winContext?: WinContext
): ApplyActionResult {
  const nextState = cloneState(state);
  const player = getPlayer(nextState, seatIndex);
  player.hasWon = true;
  nextState.wonSeatIndexes = [...(nextState.wonSeatIndexes ?? []), seatIndex];
  nextState.winnerSeatIndex ??= seatIndex;
  if (winningTile) {
    nextState.winningTile = winningTile;
  } else {
    delete nextState.winningTile;
  }
  nextState.winType = winType;
  nextState.score = score;
  appendWinRecord(nextState, seatIndex, winType, winningTile, score, winContext);
  if (state.rules.name.startsWith("sichuan")) {
    settleSichuanWin(nextState, seatIndex, score.totalPoints, "selfDraw");
  }
  if (winContext) delete nextState.gangDrawSeatIndex;
  delete nextState.pendingDiscard;

  if (nextState.wonSeatIndexes.length >= 3) {
    nextState.phase = "ended";
    nextState.endReason = "hu";
    return { ok: true, state: nextState };
  }

  nextState.phase = "playing";
  nextState.currentTurn = findNextActiveSeat(nextState, seatIndex);
  drawOrEnd(nextState, nextState.currentTurn);
  return { ok: true, state: nextState };
}

function completeSichuanDiscardWin(
  state: MahjongGameState,
  seatIndex: number,
  winningTile: Tile,
  score: ScoreResult
): ApplyActionResult {
  const nextState = cloneState(state);
  const pendingDiscard = nextState.pendingDiscard;
  const winContext =
    state.gangDiscardSeatIndex === pendingDiscard?.fromSeatIndex ? "gangDiscard" : undefined;
  const player = getPlayer(nextState, seatIndex);
  player.hasWon = true;
  nextState.wonSeatIndexes = [...(nextState.wonSeatIndexes ?? []), seatIndex];
  nextState.winnerSeatIndex ??= seatIndex;
  nextState.winningTile = winningTile;
  nextState.winType = "discard";
  nextState.score = score;
  appendWinRecord(nextState, seatIndex, "discard", winningTile, score, winContext);
  if (state.rules.name.startsWith("sichuan")) {
    settleSichuanWin(
      nextState,
      seatIndex,
      score.totalPoints,
      "discard",
      pendingDiscard?.fromSeatIndex
    );
  }

  if (nextState.wonSeatIndexes.length >= 3) {
    delete nextState.pendingDiscard;
    delete nextState.gangDiscardSeatIndex;
    nextState.phase = "ended";
    nextState.endReason = "hu";
    return { ok: true, state: nextState };
  }

  const nextHuCursor = (pendingDiscard?.huCursor ?? 0) + 1;
  const nextHuSeat = pendingDiscard?.huSeatIndexes?.[nextHuCursor];
  if (pendingDiscard && nextHuSeat !== undefined) {
    pendingDiscard.huCursor = nextHuCursor;
    nextState.currentTurn = nextHuSeat;
    return { ok: true, state: nextState };
  }

  const fromSeatIndex = pendingDiscard?.fromSeatIndex ?? seatIndex;
  delete nextState.pendingDiscard;
  delete nextState.gangDiscardSeatIndex;
  nextState.phase = "playing";
  nextState.currentTurn = findNextActiveSeat(nextState, fromSeatIndex);
  drawOrEnd(nextState, nextState.currentTurn);
  return { ok: true, state: nextState };
}

function appendWinRecord(
  state: MahjongGameState,
  winnerSeatIndex: number,
  winType: WinType,
  winningTile: Tile | undefined,
  score: ScoreResult,
  winContext?: WinContext
): void {
  const record: WinRecord = {
    score,
    winnerSeatIndex,
    winType,
    ...(winContext ? { winContext } : {}),
    ...(winningTile ? { winningTile } : {})
  };
  state.winRecords = [...(state.winRecords ?? []), record];
}

function settleSichuanWin(
  state: MahjongGameState,
  winnerSeatIndex: number,
  points: number,
  winType: WinType,
  fromSeatIndex?: number
): void {
  const paymentMode = getSichuanRuleOptions(state.rules).settlement.winPayment;
  const payers =
    winType === "discard" || paymentMode === "discardPayer"
      ? fromSeatIndex === undefined
        ? []
        : [fromSeatIndex]
      : state.players
          .filter((player) => player.seatIndex !== winnerSeatIndex && !player.hasWon)
          .map((player) => player.seatIndex);
  const scores = state.gangScores ? [...state.gangScores] : [0, 0, 0, 0];
  const transfers = state.settlementTransfers ? [...state.settlementTransfers] : [];
  for (const payer of payers) {
    if (points <= 0) continue;
    scores[payer] = (scores[payer] ?? 0) - points;
    scores[winnerSeatIndex] = (scores[winnerSeatIndex] ?? 0) + points;
    transfers.push({ fromSeatIndex: payer, points, reason: "win", toSeatIndex: winnerSeatIndex });
  }
  state.gangScores = scores as [number, number, number, number];
  state.settlementTransfers = transfers;
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
  if (state.rules.name.startsWith("sichuan")) {
    const huSeatIndexes = state.pendingDiscard.respondentSeatIndexes.filter((seatIndex) =>
      getAvailableClaimActionsForSeat(state, seatIndex).some((action) => action.type === "hu")
    );
    if (huSeatIndexes.length > 0) {
      state.pendingDiscard.huSeatIndexes = huSeatIndexes;
      state.pendingDiscard.huCursor = 0;
      state.currentTurn = huSeatIndexes[0] ?? nextSeatIndex;
      return;
    }
  }
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
  if (player.hasWon) {
    return [];
  }
  const actions: Action[] = [];
  const handWithDiscard = [...player.handTiles, pendingDiscard.tile];
  const sameTiles = player.handTiles.filter((tile) => isSameTileType(tile, pendingDiscard.tile));

  if (
    meetsMinimumFan(
      calculateScore(handWithDiscard, state.rules, { publicMelds: player.publicMelds }),
      state.rules
    ) &&
    !hasMissingSuitTiles(state, seatIndex, handWithDiscard)
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

    if (nextPendingDiscard.huSeatIndexes) {
      const nextHuCursor = (nextPendingDiscard.huCursor ?? 0) + 1;
      const nextHuSeat = nextPendingDiscard.huSeatIndexes[nextHuCursor];
      if (nextHuSeat !== undefined) {
        nextPendingDiscard.huCursor = nextHuCursor;
        nextState.currentTurn = nextHuSeat;
        return { ok: true, state: nextState };
      }
      delete nextPendingDiscard.huSeatIndexes;
      delete nextPendingDiscard.huCursor;
    }

    const nextRespondentSeatIndex = findBestRespondentSeatIndex(nextState);

    if (nextRespondentSeatIndex === undefined) {
      const nextSeatIndex = nextPendingDiscard.nextSeatIndex;
      delete nextState.pendingDiscard;
      delete nextState.gangDiscardSeatIndex;
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
    if (hasMissingSuitTiles(state, seatIndex, [...player.handTiles, pendingDiscard.tile])) {
      return { ok: false, error: "Must discard all missing-suit tiles before winning", state };
    }

    if (state.rules.name.startsWith("sichuan")) {
      if (pendingDiscard.huSeatIndexes) {
        return completeSichuanDiscardWin(state, seatIndex, pendingDiscard.tile, score);
      }
      return completeSichuanWin(state, seatIndex, pendingDiscard.tile, "discard", score);
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
  delete nextState.gangDiscardSeatIndex;
  nextState.currentTurn = seatIndex;

  if (action.type === "gang") {
    settleSichuanGang(nextState, seatIndex, "discard", nextPendingDiscard.fromSeatIndex);
    nextState.gangDrawSeatIndex = seatIndex;
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

  if (gangTileIds.length === 1) {
    const gangTile = getPlayer(state, seatIndex).handTiles.find(
      (tile) => tile.id === gangTileIds[0]
    );
    const respondents = gangTile ? getRobGangRespondents(state, seatIndex, gangTile) : [];
    if (gangTile && respondents.length > 0) {
      const nextState = cloneState(state);
      nextState.pendingGang = {
        gangTile,
        ownerSeatIndex: seatIndex,
        passedSeatIndexes: [],
        respondentCursor: 0,
        respondentSeatIndexes: respondents
      };
      nextState.currentTurn = respondents[0] ?? seatIndex;
      return { ok: true, state: nextState };
    }
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
    settleSichuanGang(nextState, seatIndex, "concealed");
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
    settleSichuanGang(nextState, seatIndex, "added");
  }

  nextState.gangDrawSeatIndex = seatIndex;

  drawOrEnd(nextState, seatIndex);
  return { ok: true, state: nextState };
}

function getRobGangRespondents(
  state: MahjongGameState,
  ownerSeatIndex: number,
  tile: Tile
): number[] {
  return state.players.flatMap((player) => {
    if (player.seatIndex === ownerSeatIndex || player.hasWon) return [];
    const score = calculateScore([...player.handTiles, tile], state.rules, {
      publicMelds: player.publicMelds
    });
    return score.canHu &&
      meetsMinimumFan(score, state.rules) &&
      !hasMissingSuitTiles(state, player.seatIndex, [...player.handTiles, tile])
      ? [player.seatIndex]
      : [];
  });
}

function getGangClaimActions(state: MahjongGameState, seatIndex: number): Action[] {
  const pendingGang = state.pendingGang;
  if (
    !pendingGang ||
    pendingGang.respondentSeatIndexes[pendingGang.respondentCursor] !== seatIndex
  ) {
    return [];
  }
  return [{ type: "pass" }, { type: "hu", tileId: pendingGang.gangTile.id }];
}

function applyGangClaimAction(
  state: MahjongGameState,
  seatIndex: number,
  action: Action
): ApplyActionResult {
  const pendingGang = state.pendingGang;
  if (
    !pendingGang ||
    !getGangClaimActions(state, seatIndex).some((candidate) => candidate.type === action.type)
  ) {
    return { ok: false, error: "Illegal rob-gang response", state };
  }

  if (action.type === "hu") {
    const player = getPlayer(state, seatIndex);
    const score = calculateScore([...player.handTiles, pendingGang.gangTile], state.rules, {
      publicMelds: player.publicMelds
    });
    if (state.rules.name.startsWith("sichuan")) {
      return completeSichuanWin(
        state,
        seatIndex,
        pendingGang.gangTile,
        "discard",
        score,
        "robGang"
      );
    }
    return {
      ok: true,
      state: {
        ...state,
        phase: "ended",
        endReason: "hu",
        winnerSeatIndex: seatIndex,
        winningTile: pendingGang.gangTile,
        winType: "discard",
        score
      }
    };
  }

  const nextState = cloneState(state);
  const nextPendingGang = nextState.pendingGang;
  if (!nextPendingGang) return { ok: false, error: "Rob-gang response expired", state };
  nextPendingGang.passedSeatIndexes.push(seatIndex);
  const nextCursor = nextPendingGang.respondentCursor + 1;
  const nextSeat = nextPendingGang.respondentSeatIndexes[nextCursor];
  if (nextSeat !== undefined) {
    nextPendingGang.respondentCursor = nextCursor;
    nextState.currentTurn = nextSeat;
    return { ok: true, state: nextState };
  }

  const ownerSeatIndex = nextPendingGang.ownerSeatIndex;
  const tileId = nextPendingGang.gangTile.id;
  delete nextState.pendingGang;
  return completeAddedGang(nextState, ownerSeatIndex, tileId);
}

function completeAddedGang(
  state: MahjongGameState,
  ownerSeatIndex: number,
  tileId: string
): ApplyActionResult {
  const nextState = cloneState(state);
  const player = getPlayer(nextState, ownerSeatIndex);
  const removedTiles = removeTilesFromHand(player, [tileId]);
  const tile = removedTiles?.[0];
  const meld = tile
    ? player.publicMelds.find(
        (candidate) =>
          candidate.type === "peng" &&
          candidate.tiles.some((meldTile) => isSameTileType(meldTile as Tile, tile))
      )
    : undefined;
  if (!tile || !meld)
    return { ok: false, error: "Added gang requires an existing peng meld", state };
  meld.type = "gang";
  meld.tiles = [...meld.tiles, tile].sort((a, b) => compareTiles(a as Tile, b as Tile));
  settleSichuanGang(nextState, ownerSeatIndex, "added");
  nextState.gangDrawSeatIndex = ownerSeatIndex;
  nextState.currentTurn = ownerSeatIndex;
  drawOrEnd(nextState, ownerSeatIndex);
  return { ok: true, state: nextState };
}

function settleSichuanGang(
  state: MahjongGameState,
  ownerSeatIndex: number,
  type: "concealed" | "added" | "discard",
  payerSeatIndex?: number
): void {
  if (!state.rules.name.startsWith("sichuan")) {
    return;
  }

  const scores = state.gangScores ? [...state.gangScores] : [0, 0, 0, 0];
  const gangPoints = getSichuanRuleOptions(state.rules).gangPoints;
  const amount = gangPoints[type];
  const payers =
    type === "discard"
      ? payerSeatIndex === undefined
        ? []
        : [payerSeatIndex]
      : state.players
          .filter((player) => player.seatIndex !== ownerSeatIndex && !player.hasWon)
          .map((player) => player.seatIndex);

  scores[ownerSeatIndex] = (scores[ownerSeatIndex] ?? 0) + amount * payers.length;
  for (const payer of payers) {
    scores[payer] = (scores[payer] ?? 0) - amount;
  }
  state.gangScores = scores as [number, number, number, number];
}

function findBestRespondentSeatIndex(state: MahjongGameState): number | undefined {
  const pendingDiscard = state.pendingDiscard;

  if (!pendingDiscard) {
    return undefined;
  }

  if (pendingDiscard.huSeatIndexes) {
    return pendingDiscard.huSeatIndexes[pendingDiscard.huCursor ?? 0];
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
    settleSichuanDraw(state);
    return;
  }

  drawTileIntoHand(getPlayer(state, seatIndex), state.wall);
}

export function settleSichuanDraw(state: MahjongGameState): void {
  if (!state.rules.name.startsWith("sichuan")) {
    return;
  }

  const activePlayers = state.players.filter((player) => !player.hasWon);
  const readyResults = activePlayers.flatMap((player) => {
    const waitingScores = getWaitingTileScores(state, player.seatIndex);
    return waitingScores.length > 0
      ? [
          {
            seatIndex: player.seatIndex,
            maxPoints: Math.max(...waitingScores.map((result) => result.totalPoints))
          }
        ]
      : [];
  });
  const readyBySeat = new Map(readyResults.map((result) => [result.seatIndex, result.maxPoints]));
  const sichuanOptions = getSichuanRuleOptions(state.rules);
  const flowerPigSeats = activePlayers
    .filter((player) => hasMissingSuitTiles(state, player.seatIndex))
    .map((player) => player.seatIndex);
  const scores = state.gangScores ? [...state.gangScores] : [0, 0, 0, 0];
  const transfers: GameSettlementTransfer[] = [];
  const addTransfer = (
    fromSeatIndex: number,
    toSeatIndex: number,
    points: number,
    reason: GameSettlementTransfer["reason"]
  ) => {
    if (points <= 0 || fromSeatIndex === toSeatIndex) return;
    scores[fromSeatIndex] = (scores[fromSeatIndex] ?? 0) - points;
    scores[toSeatIndex] = (scores[toSeatIndex] ?? 0) + points;
    transfers.push({ fromSeatIndex, points, reason, toSeatIndex });
  };

  for (const flowerPigSeat of flowerPigSeats) {
    for (const player of activePlayers) {
      if (!flowerPigSeats.includes(player.seatIndex)) {
        addTransfer(
          flowerPigSeat,
          player.seatIndex,
          sichuanOptions.settlement.flowerPigPoints,
          "flowerPig"
        );
      }
    }
  }
  for (const payer of activePlayers) {
    if (
      (sichuanOptions.settlement.skipFlowerPigReadyPayment &&
        flowerPigSeats.includes(payer.seatIndex)) ||
      readyBySeat.has(payer.seatIndex)
    )
      continue;
    for (const [winnerSeatIndex, points] of readyBySeat) {
      addTransfer(
        payer.seatIndex,
        winnerSeatIndex,
        sichuanOptions.settlement.readyPayment === "fixed"
          ? sichuanOptions.settlement.readyFixedPoints
          : points,
        "ready"
      );
    }
  }

  state.settlementScores = scores as [number, number, number, number];
  state.settlementTransfers = transfers;
}

function findNextActiveSeat(state: MahjongGameState, fromSeatIndex: number): number {
  for (let offset = 1; offset <= 4; offset += 1) {
    const seatIndex = (fromSeatIndex + offset) % 4;
    if (!getPlayer(state, seatIndex).hasWon) {
      return seatIndex;
    }
  }

  return fromSeatIndex;
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
    ...(state.exchangeThreeSelections
      ? {
          exchangeThreeSelections: Object.fromEntries(
            Object.entries(state.exchangeThreeSelections).map(([seatIndex, tileIds]) => [
              seatIndex,
              [...(tileIds ?? [])]
            ])
          )
        }
      : {}),
    ...(state.missingSuits ? { missingSuits: { ...state.missingSuits } } : {}),
    ...(state.wonSeatIndexes ? { wonSeatIndexes: [...state.wonSeatIndexes] } : {}),
    ...(state.gangScores
      ? { gangScores: [...state.gangScores] as [number, number, number, number] }
      : {}),
    ...(state.settlementScores
      ? { settlementScores: [...state.settlementScores] as [number, number, number, number] }
      : {}),
    ...(state.settlementTransfers ? { settlementTransfers: [...state.settlementTransfers] } : {}),
    ...(state.gangDrawSeatIndex === undefined
      ? {}
      : { gangDrawSeatIndex: state.gangDrawSeatIndex }),
    ...(state.gangDiscardSeatIndex === undefined
      ? {}
      : { gangDiscardSeatIndex: state.gangDiscardSeatIndex }),
    ...(state.winRecords
      ? {
          winRecords: state.winRecords.map((record) => ({
            ...record,
            score: { ...record.score, fans: record.score.fans.map((fan) => ({ ...fan })) },
            ...(record.winningTile ? { winningTile: record.winningTile } : {})
          }))
        }
      : {}),
    ...(state.pendingDiscard
      ? {
          pendingDiscard: {
            ...state.pendingDiscard,
            respondentSeatIndexes: [...state.pendingDiscard.respondentSeatIndexes] as [
              number,
              number,
              number
            ],
            passedSeatIndexes: [...state.pendingDiscard.passedSeatIndexes],
            ...(state.pendingDiscard.huSeatIndexes
              ? { huSeatIndexes: [...state.pendingDiscard.huSeatIndexes] }
              : {}),
            ...(state.pendingDiscard.huCursor !== undefined
              ? { huCursor: state.pendingDiscard.huCursor }
              : {})
          }
        }
      : {}),
    ...(state.pendingGang
      ? {
          pendingGang: {
            ...state.pendingGang,
            gangTile: { ...state.pendingGang.gangTile },
            respondentSeatIndexes: [...state.pendingGang.respondentSeatIndexes],
            passedSeatIndexes: [...state.pendingGang.passedSeatIndexes]
          }
        }
      : {})
  };
}
