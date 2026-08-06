import type {
  Action,
  AuthUser,
  GameEventMessage,
  GameHistoryEvent,
  GameLobbyRoom,
  PlayerView
} from "@mahjong/shared";
import {
  applyAction,
  chooseBasicBotAction,
  createInitialGame,
  getRulePreset,
  getLegalActions,
  simpleRuleConfig,
  type MahjongGameState
} from "mahjong-core";

import {
  createNoopGameRecordRepository,
  type GameRecoverySnapshot,
  type GameRecordRepository
} from "./gameRecordRepository.js";
import { createRoomPlayerView } from "./gameStateMapper.js";

type GameRoom = {
  events: GameHistoryEvent[];
  humanSeatIndex: number;
  humanSeatIndexByUserId: Map<number, number>;
  id: string;
  lobbyRoomId?: string;
  playerUserId: number;
  state: MahjongGameState;
};

export type GameRoomService = ReturnType<typeof createGameRoomService>;
export type CreateGameRoomServiceOptions = {
  gameRecordRepository?: GameRecordRepository;
  onPersistenceError?: (context: GamePersistenceErrorContext) => void;
};
export type GamePersistenceOperation =
  | "append-event"
  | "create-record"
  | "finish-record"
  | "save-recovery-snapshot";
export type GamePersistenceErrorContext = {
  error: unknown;
  operation: GamePersistenceOperation;
  roomId: string;
};
export type CleanupGameRoomsOptions = {
  endedRoomTtlMs: number;
  nowMs?: number;
};
type LeaveActiveGameResult =
  | {
      ended: boolean;
      mode: "quick-ended" | "bot-takeover" | "ended-no-humans" | "already-ended";
      room: GameRoom;
    }
  | { error: string };
type LeaveActiveGameReason = "disconnect" | "leave";

const maxRoomEvents = 20;
let nextRoomNumber = 1;
let nextEventNumber = 1;

function createRoomId(): string {
  const roomNumber = nextRoomNumber;
  nextRoomNumber += 1;
  return `quick-${roomNumber.toString().padStart(4, "0")}`;
}

function getHumanSeatIndex(room: GameRoom, user?: AuthUser): number {
  if (!user) {
    return room.humanSeatIndex;
  }

  return room.humanSeatIndexByUserId.get(user.id) ?? room.humanSeatIndex;
}

function createEvent(text: string): GameEventMessage {
  const eventNumber = nextEventNumber;
  nextEventNumber += 1;
  return {
    createdAt: new Date().toISOString(),
    id: `event-${eventNumber}`,
    text
  };
}

function appendExistingRoomEvent(
  events: GameHistoryEvent[],
  event: GameHistoryEvent
): GameHistoryEvent[] {
  return [...events, event].slice(-maxRoomEvents);
}

function stripEventSnapshot(event: GameHistoryEvent): GameEventMessage {
  return {
    createdAt: event.createdAt,
    id: event.id,
    text: event.text
  };
}

function haveSameTileIds(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined
): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right || left.length !== right.length) {
    return false;
  }

  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();

  return sortedLeft.every((tileId, index) => tileId === sortedRight[index]);
}

function isLegalActionRequest(legalActions: readonly Action[], action: Action): boolean {
  return legalActions.some(
    (candidate) =>
      candidate.type === action.type &&
      candidate.tileId === action.tileId &&
      haveSameTileIds(candidate.tileIds, action.tileIds)
  );
}

function describeAction(state: MahjongGameState, seatIndex: number, action: Action): string {
  const player = state.players[seatIndex];
  const username = player?.username ?? `${seatIndex + 1}号位`;

  if (action.type === "discard") {
    const tile = player?.handTiles.find((candidate) => candidate.id === action.tileId);
    return `${username} 打出 ${tile?.label ?? "一张牌"}`;
  }

  const actionLabels: Record<Action["type"], string> = {
    chi: "吃",
    discard: "打出",
    gang: "杠",
    hu: "胡",
    pass: "过",
    peng: "碰",
    exchangeThree: "换三张",
    chooseMissingSuit: "定缺"
  };

  return `${username} ${actionLabels[action.type]}`;
}

export function describeGameEnd(state: MahjongGameState): string {
  if (state.endReason === "draw") {
    if (state.rules.name.startsWith("sichuan") && state.winRecords && state.winRecords.length > 0) {
      return `牌局流局，${state.winRecords.length} 位玩家已胡`;
    }
    return "牌局流局";
  }

  if (state.endReason === "hu") {
    if (state.rules.name.startsWith("sichuan") && state.winRecords && state.winRecords.length > 0) {
      const winnerText = state.winRecords
        .map((record) => {
          const name =
            state.players[record.winnerSeatIndex]?.username ?? `${record.winnerSeatIndex + 1}号位`;
          return `${name} ${record.score.totalPoints}分`;
        })
        .join("、");
      const gangText = state.gangScores ? `，杠分 ${state.gangScores.join("/")}` : "";
      return `血战结束：${winnerText}${gangText}`;
    }
    const winner =
      state.winnerSeatIndex === undefined ? undefined : state.players[state.winnerSeatIndex];
    const winnerName = winner?.username ?? "玩家";
    const winTypeText =
      state.winType === "selfDraw" ? "自摸" : state.winType === "discard" ? "点炮" : "胡牌";
    const winningTileText = state.winningTile ? `，胡 ${state.winningTile.label}` : "";
    const scoreText = state.score ? `，${state.score.totalPoints} 分` : "";

    return `${winnerName} ${winTypeText}${winningTileText}${scoreText}`;
  }

  return "牌局结束";
}

export function createGameRoomService(options: CreateGameRoomServiceOptions = {}) {
  const roomsById = new Map<string, GameRoom>();
  const activeGameRoomIdByLobbyRoomId = new Map<string, string>();
  const activeRoomIdByUserId = new Map<number, string>();
  const roundNumberByLobbyRoomId = new Map<string, number>();
  const gameRecordRepository = options.gameRecordRepository ?? createNoopGameRecordRepository();
  const persistentWriteQueueByRoomId = new Map<string, Promise<void>>();
  const updatedAtMsByRoomId = new Map<string, number>();

  function enqueuePersistentWrite(
    roomId: string,
    operation: GamePersistenceOperation,
    write: () => Promise<void>
  ): void {
    const previousWrite = persistentWriteQueueByRoomId.get(roomId) ?? Promise.resolve();
    const nextWrite = previousWrite.then(write).catch((error: unknown) => {
      options.onPersistenceError?.({ error, operation, roomId });
    });

    persistentWriteQueueByRoomId.set(roomId, nextWrite);
  }

  function createRoomViewSnapshot(room: GameRoom): PlayerView {
    return createRoomPlayerView({
      events: room.events.map(stripEventSnapshot),
      roomId: room.id,
      seatIndex: room.humanSeatIndex,
      state: room.state
    });
  }

  function createRecoverySnapshot(room: GameRoom): GameRecoverySnapshot {
    return structuredClone({
      events: room.events.map(stripEventSnapshot),
      humanSeatIndex: room.humanSeatIndex,
      humanSeats: [...room.humanSeatIndexByUserId.entries()].map(([userId, seatIndex]) => ({
        seatIndex,
        userId
      })),
      ...(room.lobbyRoomId ? { lobbyRoomId: room.lobbyRoomId } : {}),
      playerUserId: room.playerUserId,
      roomId: room.id,
      state: room.state,
      version: 1 as const
    });
  }

  function saveRecoverySnapshot(room: GameRoom): void {
    const snapshot = createRecoverySnapshot(room);
    enqueuePersistentWrite(room.id, "save-recovery-snapshot", () =>
      gameRecordRepository.saveRecoverySnapshot(room.id, snapshot)
    );
  }

  function recordRoomEvent(room: GameRoom, text: string): void {
    const baseEvent = createEvent(text);
    const event = {
      ...baseEvent,
      viewSnapshot: createRoomViewSnapshot({
        ...room,
        events: appendExistingRoomEvent(room.events, baseEvent)
      })
    };
    room.events = appendExistingRoomEvent(room.events, event);
    updatedAtMsByRoomId.set(room.id, Date.now());
    enqueuePersistentWrite(room.id, "append-event", () =>
      gameRecordRepository.appendEvent(room.id, event)
    );
    saveRecoverySnapshot(room);
  }

  function recordGameEnd(room: GameRoom): void {
    enqueuePersistentWrite(room.id, "finish-record", () =>
      gameRecordRepository.finishRecord({
        roomId: room.id,
        state: room.state
      })
    );
  }

  function finishRoomAsDraw(room: GameRoom, eventText: string): void {
    if (room.state.phase === "ended") {
      return;
    }

    room.state.phase = "ended";
    room.state.endReason = "draw";
    delete room.state.pendingDiscard;
    recordRoomEvent(room, eventText);
    recordRoomEvent(room, describeGameEnd(room.state));
    recordGameEnd(room);
  }

  function createQuickRoom(user: AuthUser): GameRoom {
    const room: GameRoom = {
      events: [],
      humanSeatIndex: 0,
      humanSeatIndexByUserId: new Map([[user.id, 0]]),
      id: createRoomId(),
      playerUserId: user.id,
      state: createInitialGame({
        players: [
          { isBot: false, username: user.username },
          { isBot: true, username: "玩家Bot1" },
          { isBot: true, username: "玩家Bot2" },
          { isBot: true, username: "玩家Bot3" }
        ],
        rules: simpleRuleConfig
      })
    };

    roomsById.set(room.id, room);
    updatedAtMsByRoomId.set(room.id, Date.now());
    activeRoomIdByUserId.set(user.id, room.id);
    enqueuePersistentWrite(room.id, "create-record", () =>
      gameRecordRepository.createRecord({
        humanSeatIndex: room.humanSeatIndex,
        playerUserId: room.playerUserId,
        roomId: room.id,
        ruleName: room.state.rules.name,
        ruleVersion: room.state.rules.version
      })
    );
    recordRoomEvent(room, `${user.username} 加入快速对局`);
    return room;
  }

  function createRoomFromLobby(lobbyRoom: GameLobbyRoom): GameRoom {
    const activeGameRoomId = activeGameRoomIdByLobbyRoomId.get(lobbyRoom.roomId);
    const existingRoom = activeGameRoomId ? roomsById.get(activeGameRoomId) : undefined;
    if (existingRoom && existingRoom.state.phase !== "ended") {
      return existingRoom;
    }

    const roundNumber = (roundNumberByLobbyRoomId.get(lobbyRoom.roomId) ?? 0) + 1;
    roundNumberByLobbyRoomId.set(lobbyRoom.roomId, roundNumber);

    const humanSeats = lobbyRoom.seats.filter((seat) => seat.userId !== undefined && !seat.isBot);
    const primaryHumanSeat =
      humanSeats.find((seat) => seat.userId === lobbyRoom.ownerUserId) ?? humanSeats[0];
    if (!primaryHumanSeat?.userId) {
      throw new Error("Cannot create a game room without a human player");
    }

    const humanSeatIndexByUserId = new Map<number, number>();
    for (const seat of humanSeats) {
      if (seat.userId !== undefined) {
        humanSeatIndexByUserId.set(seat.userId, seat.seatIndex);
      }
    }

    const room: GameRoom = {
      events: [],
      humanSeatIndex: primaryHumanSeat.seatIndex,
      humanSeatIndexByUserId,
      id: `${lobbyRoom.roomId}-round-${roundNumber.toString().padStart(4, "0")}`,
      lobbyRoomId: lobbyRoom.roomId,
      playerUserId: primaryHumanSeat.userId,
      state: createInitialGame({
        players: lobbyRoom.seats.map((seat) => ({
          isBot: seat.isBot,
          username:
            seat.username ?? (seat.isBot ? `玩家Bot${seat.seatIndex}` : `${seat.seatIndex + 1}号位`)
        })),
        rules: getRulePreset(lobbyRoom.ruleName ?? "simple") ?? simpleRuleConfig
      })
    };

    roomsById.set(room.id, room);
    updatedAtMsByRoomId.set(room.id, Date.now());
    activeGameRoomIdByLobbyRoomId.set(lobbyRoom.roomId, room.id);
    for (const userId of humanSeatIndexByUserId.keys()) {
      activeRoomIdByUserId.set(userId, room.id);
    }
    enqueuePersistentWrite(room.id, "create-record", () =>
      gameRecordRepository.createRecord({
        humanSeatIndex: room.humanSeatIndex,
        playerUserId: room.playerUserId,
        roomId: room.id,
        ruleName: room.state.rules.name,
        ruleVersion: room.state.rules.version
      })
    );
    recordRoomEvent(room, `${primaryHumanSeat.username ?? "房主"} 开始多人房间`);
    return room;
  }

  function getRoom(roomId: string): GameRoom | null {
    const gameRoomId = activeGameRoomIdByLobbyRoomId.get(roomId) ?? roomId;
    return roomsById.get(gameRoomId) ?? null;
  }

  function getRoomForUser(user: AuthUser, roomId?: string): GameRoom | null {
    const requestedRoomId = roomId ?? activeRoomIdByUserId.get(user.id);
    const targetRoomId = requestedRoomId
      ? (activeGameRoomIdByLobbyRoomId.get(requestedRoomId) ?? requestedRoomId)
      : undefined;
    if (!targetRoomId) {
      return null;
    }

    const room = roomsById.get(targetRoomId);
    return room?.humanSeatIndexByUserId.has(user.id) ? room : null;
  }

  function getOrCreateQuickRoom(user: AuthUser): GameRoom {
    const activeRoom = getRoomForUser(user);
    if (!activeRoom || activeRoom.state.phase === "ended") {
      return createQuickRoom(user);
    }

    return activeRoom;
  }

  function getPlayerView(
    room: GameRoom,
    user?: AuthUser,
    timing?: { turnDeadlineAt?: string }
  ): PlayerView {
    return createRoomPlayerView({
      events: room.events,
      roomId: room.id,
      seatIndex: getHumanSeatIndex(room, user),
      state: room.state,
      ...(timing?.turnDeadlineAt ? { turnDeadlineAt: timing.turnDeadlineAt } : {}),
      unlimitedHumanTurn: !room.lobbyRoomId
    });
  }

  async function restoreActiveRooms(): Promise<GameRecoverySnapshot[]> {
    const { invalidRoomIds, snapshots } = await gameRecordRepository.listActiveRecoverySnapshots();
    await gameRecordRepository.markRecordsAbnormal(
      invalidRoomIds,
      "服务重启时恢复快照无效，牌局异常结束"
    );
    for (const snapshot of snapshots) {
      const room: GameRoom = {
        events: snapshot.events,
        humanSeatIndex: snapshot.humanSeatIndex,
        humanSeatIndexByUserId: new Map(
          snapshot.humanSeats.map((seat) => [seat.userId, seat.seatIndex])
        ),
        id: snapshot.roomId,
        ...(snapshot.lobbyRoomId ? { lobbyRoomId: snapshot.lobbyRoomId } : {}),
        playerUserId: snapshot.playerUserId,
        state: snapshot.state
      };

      roomsById.set(room.id, room);
      updatedAtMsByRoomId.set(room.id, Date.now());
      for (const userId of room.humanSeatIndexByUserId.keys()) {
        activeRoomIdByUserId.set(userId, room.id);
      }
      if (room.lobbyRoomId) {
        activeGameRoomIdByLobbyRoomId.set(room.lobbyRoomId, room.id);
        const roundNumber = Number(room.id.match(/-round-(\d+)$/)?.[1] ?? 0);
        roundNumberByLobbyRoomId.set(
          room.lobbyRoomId,
          Math.max(roundNumberByLobbyRoomId.get(room.lobbyRoomId) ?? 0, roundNumber)
        );
      }
    }

    return snapshots;
  }

  function cleanupExpiredRooms(options: CleanupGameRoomsOptions): string[] {
    const nowMs = options.nowMs ?? Date.now();
    const removedRoomIds: string[] = [];

    for (const room of roomsById.values()) {
      const updatedAtMs = updatedAtMsByRoomId.get(room.id) ?? nowMs;
      if (room.state.phase !== "ended" || nowMs - updatedAtMs < options.endedRoomTtlMs) {
        continue;
      }

      roomsById.delete(room.id);
      updatedAtMsByRoomId.delete(room.id);
      persistentWriteQueueByRoomId.delete(room.id);
      for (const userId of room.humanSeatIndexByUserId.keys()) {
        if (activeRoomIdByUserId.get(userId) === room.id) {
          activeRoomIdByUserId.delete(userId);
        }
      }
      if (room.lobbyRoomId && activeGameRoomIdByLobbyRoomId.get(room.lobbyRoomId) === room.id) {
        activeGameRoomIdByLobbyRoomId.delete(room.lobbyRoomId);
      }
      removedRoomIds.push(room.id);
    }

    return removedRoomIds;
  }

  function applyHumanAction(
    user: AuthUser,
    action: Action
  ): { error?: string; room: GameRoom } | null {
    const room = getRoomForUser(user);
    if (!room) {
      return null;
    }

    const seatIndex = getHumanSeatIndex(room, user);
    const legalActions = getLegalActions(room.state, seatIndex);
    if (!isLegalActionRequest(legalActions, action)) {
      return { error: "Illegal action", room };
    }

    const eventText = describeAction(room.state, seatIndex, action);
    const result = applyAction(room.state, seatIndex, action);
    if (!result.ok) {
      return { error: result.error, room };
    }

    room.state = result.state;
    recordRoomEvent(room, eventText);
    if (room.state.phase === "ended") {
      recordRoomEvent(room, describeGameEnd(room.state));
      recordGameEnd(room);
    }

    return { room };
  }

  function applyHumanTimeout(room: GameRoom): boolean {
    if (
      room.state.phase === "ended" ||
      ![...room.humanSeatIndexByUserId.values()].includes(room.state.currentTurn)
    ) {
      return false;
    }

    const seatIndex = room.state.currentTurn;
    const player = room.state.players[seatIndex];
    if (!player || player.isBot) {
      return false;
    }

    const action = chooseBasicBotAction(room.state, seatIndex);
    const eventText = `${player.username} 超时托管，${describeAction(room.state, seatIndex, action)}`;
    const result = applyAction(room.state, seatIndex, action);
    if (!result.ok) {
      recordRoomEvent(room, `${player.username} 超时托管失败：${result.error}`);
      return false;
    }

    room.state = result.state;
    recordRoomEvent(room, eventText);
    if (room.state.phase === "ended") {
      recordRoomEvent(room, describeGameEnd(room.state));
      recordGameEnd(room);
    }

    return true;
  }

  function applyNextBotAction(room: GameRoom): boolean {
    if (room.state.phase === "ended") {
      return false;
    }

    const botSeatIndex =
      room.state.phase === "exchange-three"
        ? room.state.players.find(
            (candidate) =>
              candidate.isBot && !room.state.exchangeThreeSelections?.[candidate.seatIndex]
          )?.seatIndex
        : room.state.phase === "choose-missing-suit"
          ? room.state.players.find(
              (candidate) => candidate.isBot && !room.state.missingSuits?.[candidate.seatIndex]
            )?.seatIndex
          : room.state.currentTurn;
    const player = botSeatIndex === undefined ? undefined : room.state.players[botSeatIndex];
    if (!player?.isBot) {
      return false;
    }

    const action = chooseBasicBotAction(room.state, player.seatIndex);
    const eventText = describeAction(room.state, player.seatIndex, action);
    const result = applyAction(room.state, player.seatIndex, action);
    if (!result.ok) {
      recordRoomEvent(room, `${player.username} 操作失败：${result.error}`);
      return false;
    }

    room.state = result.state;
    recordRoomEvent(room, eventText);
    if (room.state.phase === "ended") {
      recordRoomEvent(room, describeGameEnd(room.state));
      recordGameEnd(room);
    }

    return true;
  }

  function leaveActiveGame(
    user: AuthUser,
    reason: LeaveActiveGameReason = "leave"
  ): LeaveActiveGameResult {
    const room = getRoomForUser(user);
    if (!room) {
      return { error: "No active game room" };
    }

    const seatIndex = room.humanSeatIndexByUserId.get(user.id);
    if (seatIndex === undefined) {
      return { error: "Player is not seated in this game" };
    }

    activeRoomIdByUserId.delete(user.id);

    if (room.state.phase === "ended") {
      room.humanSeatIndexByUserId.delete(user.id);
      return { ended: true, mode: "already-ended", room };
    }

    if (room.id.startsWith("quick-")) {
      room.humanSeatIndexByUserId.delete(user.id);
      const eventText =
        reason === "disconnect"
          ? `${user.username} 断线超时，单人牌局结束`
          : `${user.username} 返回大厅，单人牌局结束`;
      finishRoomAsDraw(room, eventText);
      return { ended: true, mode: "quick-ended", room };
    }

    room.humanSeatIndexByUserId.delete(user.id);
    const player = room.state.players[seatIndex];
    if (!player) {
      return { error: "Player seat is not available" };
    }

    player.isBot = true;
    player.username = `${user.username}托管Bot`;
    const eventText =
      reason === "disconnect"
        ? `${user.username} 断线超时，${player.username} 接手牌局`
        : `${user.username} 返回大厅，${player.username} 接手牌局`;
    recordRoomEvent(room, eventText);

    if (room.humanSeatIndexByUserId.size === 0) {
      finishRoomAsDraw(room, "房间内没有真人玩家，牌局结束");
      return { ended: true, mode: "ended-no-humans", room };
    }

    return { ended: false, mode: "bot-takeover", room };
  }

  async function waitForPersistentWrites(roomId?: string): Promise<void> {
    if (roomId) {
      await persistentWriteQueueByRoomId.get(roomId);
      return;
    }

    await Promise.all(persistentWriteQueueByRoomId.values());
  }

  return {
    cleanupExpiredRooms,
    applyHumanAction,
    applyHumanTimeout,
    applyNextBotAction,
    createRoomFromLobby,
    getOrCreateQuickRoom,
    getPlayerView,
    getRoom,
    getRoomForUser,
    leaveActiveGame,
    restoreActiveRooms,
    waitForPersistentWrites
  };
}
