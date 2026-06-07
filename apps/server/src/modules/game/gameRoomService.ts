import type { Action, AuthUser, GameEventMessage, PlayerView } from "@mahjong/shared";
import {
  applyAction,
  chooseBasicBotAction,
  createInitialGame,
  getLegalActions,
  simpleRuleConfig,
  type MahjongGameState
} from "mahjong-core";

import { createRoomPlayerView } from "./gameStateMapper.js";

type GameRoom = {
  events: GameEventMessage[];
  humanSeatIndex: number;
  id: string;
  playerUserId: number;
  state: MahjongGameState;
};

export type GameRoomService = ReturnType<typeof createGameRoomService>;

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

function appendRoomEvent(events: GameEventMessage[], text: string): GameEventMessage[] {
  return [...events, createEvent(text)].slice(-maxRoomEvents);
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
    const winningTileText = state.winningTile ? `，胡 ${state.winningTile.label}` : "";
    const scoreText = state.score ? `，${state.score.totalPoints} 分` : "";

    return `${winnerName} 胡牌${winningTileText}${scoreText}`;
  }

  return "牌局结束";
}

export function createGameRoomService() {
  const roomsById = new Map<string, GameRoom>();
  const activeRoomIdByUserId = new Map<number, string>();

  function createQuickRoom(user: AuthUser): GameRoom {
    const room: GameRoom = {
      events: appendRoomEvent([], `${user.username} 加入快速对局`),
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

    const result = applyAction(room.state, room.humanSeatIndex, action);
    if (!result.ok) {
      return { error: result.error, room };
    }

    room.events = appendRoomEvent(room.events, describeAction(room.state, room.humanSeatIndex, action));
    room.state = result.state;
    if (room.state.phase === "ended") {
      room.events = appendRoomEvent(room.events, describeGameEnd(room.state));
    }

    return { room };
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
    const result = applyAction(room.state, player.seatIndex, action);
    if (!result.ok) {
      room.events = appendRoomEvent(room.events, `${player.username} 操作失败：${result.error}`);
      return false;
    }

    room.events = appendRoomEvent(room.events, describeAction(room.state, player.seatIndex, action));
    room.state = result.state;
    if (room.state.phase === "ended") {
      room.events = appendRoomEvent(room.events, describeGameEnd(room.state));
    }

    return true;
  }

  return {
    applyHumanAction,
    applyNextBotAction,
    getOrCreateQuickRoom,
    getPlayerView,
    getRoomForUser
  };
}
