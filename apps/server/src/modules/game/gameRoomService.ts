import type { Action, AuthUser, GameEventMessage, GameHistoryEvent, PlayerView } from "@mahjong/shared";
import {
  applyAction,
  chooseBasicBotAction,
  createInitialGame,
  getLegalActions,
  simpleRuleConfig,
  type MahjongGameState
} from "mahjong-core";

import {
  createNoopGameRecordRepository,
  type GameRecordRepository
} from "./gameRecordRepository.js";
import { createRoomPlayerView } from "./gameStateMapper.js";

type GameRoom = {
  events: GameHistoryEvent[];
  humanSeatIndex: number;
  id: string;
  playerUserId: number;
  state: MahjongGameState;
};

export type GameRoomService = ReturnType<typeof createGameRoomService>;
export type CreateGameRoomServiceOptions = {
  gameRecordRepository?: GameRecordRepository;
};

const maxRoomEvents = 20;
let nextRoomNumber = 1;
let nextEventNumber = 1;

function createRoomId(): string {
  const roomNumber = nextRoomNumber;
  nextRoomNumber += 1;
  return `quick-${roomNumber.toString().padStart(4, "0")}`;
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

function haveSameTileIds(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
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
    peng: "碰"
  };

  return `${username} ${actionLabels[action.type]}`;
}

export function describeGameEnd(state: MahjongGameState): string {
  if (state.endReason === "draw") {
    return "牌局流局";
  }

  if (state.endReason === "hu") {
    const winner = state.winnerSeatIndex === undefined ? undefined : state.players[state.winnerSeatIndex];
    const winnerName = winner?.username ?? "玩家";
    const winTypeText = state.winType === "selfDraw" ? "自摸" : state.winType === "discard" ? "点炮" : "胡牌";
    const winningTileText = state.winningTile ? `，胡 ${state.winningTile.label}` : "";
    const scoreText = state.score ? `，${state.score.totalPoints} 分` : "";

    return `${winnerName} ${winTypeText}${winningTileText}${scoreText}`;
  }

  return "牌局结束";
}

export function createGameRoomService(options: CreateGameRoomServiceOptions = {}) {
  const roomsById = new Map<string, GameRoom>();
  const activeRoomIdByUserId = new Map<number, string>();
  const gameRecordRepository =
    options.gameRecordRepository ?? createNoopGameRecordRepository();
  const persistentWriteQueueByRoomId = new Map<string, Promise<void>>();

  function enqueuePersistentWrite(roomId: string, write: () => Promise<void>): void {
    const previousWrite = persistentWriteQueueByRoomId.get(roomId) ?? Promise.resolve();
    const nextWrite = previousWrite
      .catch(() => undefined)
      .then(write)
      .catch(() => undefined);

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
    enqueuePersistentWrite(room.id, () => gameRecordRepository.appendEvent(room.id, event));
  }

  function recordGameEnd(room: GameRoom): void {
    enqueuePersistentWrite(room.id, () =>
      gameRecordRepository.finishRecord({
        roomId: room.id,
        state: room.state
      })
    );
  }

  function createQuickRoom(user: AuthUser): GameRoom {
    const room: GameRoom = {
      events: [],
      humanSeatIndex: 0,
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
    activeRoomIdByUserId.set(user.id, room.id);
    enqueuePersistentWrite(room.id, () =>
      gameRecordRepository.createRecord({
        humanSeatIndex: room.humanSeatIndex,
        playerUserId: room.playerUserId,
        roomId: room.id,
        ruleName: room.state.rules.name
      })
    );
    recordRoomEvent(room, `${user.username} 加入快速对局`);
    return room;
  }

  function getRoomForUser(user: AuthUser, roomId?: string): GameRoom | null {
    const targetRoomId = roomId ?? activeRoomIdByUserId.get(user.id);
    if (!targetRoomId) {
      return null;
    }

    const room = roomsById.get(targetRoomId);
    return room?.playerUserId === user.id ? room : null;
  }

  function getOrCreateQuickRoom(user: AuthUser): GameRoom {
    const activeRoom = getRoomForUser(user);
    if (!activeRoom || activeRoom.state.phase === "ended") {
      return createQuickRoom(user);
    }

    return activeRoom;
  }

  function getPlayerView(room: GameRoom): PlayerView {
    return createRoomPlayerView({
      events: room.events,
      roomId: room.id,
      seatIndex: room.humanSeatIndex,
      state: room.state
    });
  }

  function applyHumanAction(user: AuthUser, action: Action): { error?: string; room: GameRoom } | null {
    const room = getRoomForUser(user);
    if (!room) {
      return null;
    }

    const legalActions = getLegalActions(room.state, room.humanSeatIndex);
    if (!isLegalActionRequest(legalActions, action)) {
      return { error: "Illegal action", room };
    }

    const eventText = describeAction(room.state, room.humanSeatIndex, action);
    const result = applyAction(room.state, room.humanSeatIndex, action);
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
    if (room.state.phase !== "playing" || room.state.currentTurn !== room.humanSeatIndex) {
      return false;
    }

    const player = room.state.players[room.humanSeatIndex];
    if (!player || player.isBot) {
      return false;
    }

    const action = chooseBasicBotAction(room.state, room.humanSeatIndex);
    const eventText = `${player.username} 超时托管，${describeAction(room.state, room.humanSeatIndex, action)}`;
    const result = applyAction(room.state, room.humanSeatIndex, action);
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
    if (room.state.phase !== "playing") {
      return false;
    }

    const player = room.state.players[room.state.currentTurn];
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

  async function waitForPersistentWrites(roomId?: string): Promise<void> {
    if (roomId) {
      await persistentWriteQueueByRoomId.get(roomId);
      return;
    }

    await Promise.all(persistentWriteQueueByRoomId.values());
  }

  return {
    applyHumanAction,
    applyHumanTimeout,
    applyNextBotAction,
    getOrCreateQuickRoom,
    getPlayerView,
    getRoomForUser,
    waitForPersistentWrites
  };
}
