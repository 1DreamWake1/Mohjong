import type { AuthUser, GameLobbyRoom, GameLobbySeat } from "@mahjong/shared";
import { getRulePreset, simpleRuleConfig, type RulePresetName } from "mahjong-core";

import type { GameRecoverySnapshot } from "./gameRecordRepository.js";

type MutableLobbyRoom = GameLobbyRoom;

export type GameLobbyRoomListener = (room: GameLobbyRoom) => void;

export type JoinGameLobbyRoomResult =
  | { ok: true; room: GameLobbyRoom }
  | { ok: false; reason: "not_found" | "full" | "already_in_other_room" };

export type LeaveGameLobbyRoomResult =
  | { ok: true; room: GameLobbyRoom | null }
  | { ok: false; reason: "not_found" | "playing" };

export type SetGameLobbyRoomReadyResult =
  | { ok: true; room: GameLobbyRoom }
  | { ok: false; reason: "not_found" | "already_started" };

export type StartGameLobbyRoomResult =
  | { ok: true; room: GameLobbyRoom }
  | { ok: false; reason: "not_found" | "forbidden" | "not_ready" | "already_started" };

export type FinishGameLobbyRoomResult =
  | { ok: true; room: GameLobbyRoom }
  | { ok: false; reason: "not_found" };

export type ReplaceLobbyPlayerWithBotResult =
  | { ok: true; room: GameLobbyRoom }
  | { ok: false; reason: "not_found" | "not_playing" };

export type ResetGameLobbyRoomResult =
  | { ok: true; room: GameLobbyRoom }
  | { ok: false; reason: "not_found" | "forbidden" | "not_ended" };

export type CleanupLobbyRoomsOptions = {
  endedRoomTtlMs: number;
  nowMs?: number;
  waitingRoomTtlMs: number;
};

let nextLobbyRoomNumber = 1;

function createLobbyRoomId(): string {
  const roomNumber = nextLobbyRoomNumber;
  nextLobbyRoomNumber += 1;
  return `room-${roomNumber.toString().padStart(4, "0")}`;
}

function createEmptySeats(owner: AuthUser): GameLobbySeat[] {
  return [
    {
      isBot: false,
      isReady: true,
      seatIndex: 0,
      userId: owner.id,
      username: owner.username
    },
    { isBot: false, isReady: false, seatIndex: 1 },
    { isBot: false, isReady: false, seatIndex: 2 },
    { isBot: false, isReady: false, seatIndex: 3 }
  ];
}

function cloneRoom(room: MutableLobbyRoom): GameLobbyRoom {
  return {
    ...room,
    seats: room.seats.map((seat) => ({ ...seat }))
  };
}

function findUserSeat(room: MutableLobbyRoom, userId: number): GameLobbySeat | undefined {
  return room.seats.find((seat) => seat.userId === userId);
}

function areHumanSeatsReady(room: MutableLobbyRoom): boolean {
  return room.seats
    .filter((seat) => seat.userId !== undefined && !seat.isBot)
    .every((seat) => seat.isReady);
}

function fillEmptySeatsWithBots(room: MutableLobbyRoom): void {
  for (const seat of room.seats) {
    if (seat.userId !== undefined || seat.isBot) {
      continue;
    }

    seat.isBot = true;
    seat.isReady = true;
    seat.username = `玩家Bot${seat.seatIndex}`;
  }
}

function clearSeat(seat: GameLobbySeat): void {
  delete seat.userId;
  delete seat.username;
  seat.isBot = false;
  seat.isReady = false;
}

function findNextHumanSeat(room: MutableLobbyRoom): GameLobbySeat | undefined {
  return room.seats.find((seat) => seat.userId !== undefined && !seat.isBot);
}

function hasHumanSeats(room: MutableLobbyRoom): boolean {
  return room.seats.some((seat) => seat.userId !== undefined && !seat.isBot);
}

export function createGameLobbyService() {
  const roomsById = new Map<string, MutableLobbyRoom>();
  const activeRoomIdByUserId = new Map<number, string>();
  const roomListeners = new Set<GameLobbyRoomListener>();

  function notifyRoomUpdated(room: MutableLobbyRoom): void {
    const snapshot = cloneRoom(room);
    for (const listener of roomListeners) {
      listener(snapshot);
    }
  }

  function cleanupExpiredRooms(options: CleanupLobbyRoomsOptions): string[] {
    const nowMs = options.nowMs ?? Date.now();
    const removedRoomIds: string[] = [];

    for (const room of roomsById.values()) {
      if (room.status === "playing") {
        continue;
      }

      const ttlMs = room.status === "ended" ? options.endedRoomTtlMs : options.waitingRoomTtlMs;
      const updatedAtMs = Date.parse(room.updatedAt);
      if (!Number.isFinite(updatedAtMs) || nowMs - updatedAtMs < ttlMs) {
        continue;
      }

      for (const seat of room.seats) {
        if (seat.userId !== undefined && activeRoomIdByUserId.get(seat.userId) === room.roomId) {
          activeRoomIdByUserId.delete(seat.userId);
        }
        clearSeat(seat);
      }
      room.status = "ended";
      room.updatedAt = new Date(nowMs).toISOString();
      notifyRoomUpdated(room);
      roomsById.delete(room.roomId);
      removedRoomIds.push(room.roomId);
    }

    return removedRoomIds;
  }

  function getCurrentRoom(user: AuthUser): GameLobbyRoom | null {
    const roomId = activeRoomIdByUserId.get(user.id);
    if (!roomId) {
      return null;
    }

    const room = roomsById.get(roomId);
    if (!room || !findUserSeat(room, user.id)) {
      activeRoomIdByUserId.delete(user.id);
      return null;
    }

    return cloneRoom(room);
  }

  function listRooms(): GameLobbyRoom[] {
    return [...roomsById.values()]
      .map(cloneRoom)
      .sort((leftRoom, rightRoom) => rightRoom.updatedAt.localeCompare(leftRoom.updatedAt));
  }

  function restorePlayingRoom(snapshot: GameRecoverySnapshot): GameLobbyRoom | null {
    if (!snapshot.lobbyRoomId || roomsById.has(snapshot.lobbyRoomId)) {
      return null;
    }

    const userIdBySeatIndex = new Map(
      snapshot.humanSeats.map((seat) => [seat.seatIndex, seat.userId])
    );
    const humanUserIds = [...userIdBySeatIndex.values()];
    const ownerUserId = humanUserIds.includes(snapshot.playerUserId)
      ? snapshot.playerUserId
      : humanUserIds[0];
    if (ownerUserId === undefined) {
      return null;
    }

    const now = new Date().toISOString();
    const room: MutableLobbyRoom = {
      createdAt: now,
      ownerUserId,
      ruleName: snapshot.state.rules.name as RulePresetName,
      ruleVersion: snapshot.state.rules.version,
      roomId: snapshot.lobbyRoomId,
      seats: snapshot.state.players.map((player) => {
        const userId = userIdBySeatIndex.get(player.seatIndex);
        return {
          isBot: userId === undefined,
          isReady: true,
          seatIndex: player.seatIndex,
          ...(userId === undefined ? {} : { userId }),
          username: player.username
        };
      }),
      status: "playing",
      updatedAt: now
    };
    roomsById.set(room.roomId, room);
    for (const userId of humanUserIds) {
      activeRoomIdByUserId.set(userId, room.roomId);
    }
    notifyRoomUpdated(room);
    return cloneRoom(room);
  }

  function createRoom(user: AuthUser, ruleName: RulePresetName = "simple"): GameLobbyRoom {
    const activeRoom = getCurrentRoom(user);
    if (activeRoom && activeRoom.status !== "ended") {
      return activeRoom;
    }
    if (activeRoom?.status === "ended") {
      clearEndedRoomMembership(user.id);
    }

    const now = new Date().toISOString();
    const rules = getRulePreset(ruleName) ?? simpleRuleConfig;
    const room: MutableLobbyRoom = {
      createdAt: now,
      ownerUserId: user.id,
      ruleName: rules.name as RulePresetName,
      ruleVersion: rules.version,
      roomId: createLobbyRoomId(),
      seats: createEmptySeats(user),
      status: "waiting",
      updatedAt: now
    };

    roomsById.set(room.roomId, room);
    activeRoomIdByUserId.set(user.id, room.roomId);
    notifyRoomUpdated(room);
    return cloneRoom(room);
  }

  function removeUserFromRoom(userId: number, room: MutableLobbyRoom): GameLobbyRoom | null {
    const seat = findUserSeat(room, userId);
    if (!seat) {
      activeRoomIdByUserId.delete(userId);
      return cloneRoom(room);
    }

    activeRoomIdByUserId.delete(userId);
    clearSeat(seat);

    const nextOwnerSeat = findNextHumanSeat(room);
    if (!nextOwnerSeat?.userId) {
      roomsById.delete(room.roomId);
      return null;
    }

    if (room.ownerUserId === userId) {
      room.ownerUserId = nextOwnerSeat.userId;
    }
    room.updatedAt = new Date().toISOString();
    notifyRoomUpdated(room);
    return cloneRoom(room);
  }

  function clearEndedRoomMembership(userId: number): void {
    const activeRoomId = activeRoomIdByUserId.get(userId);
    const activeRoom = activeRoomId ? roomsById.get(activeRoomId) : undefined;
    if (activeRoom?.status === "ended") {
      removeUserFromRoom(userId, activeRoom);
    }
  }

  function joinRoom(user: AuthUser, roomId: string): JoinGameLobbyRoomResult {
    const room = roomsById.get(roomId);
    if (!room || room.status !== "waiting") {
      return { ok: false, reason: "not_found" };
    }

    const activeRoomId = activeRoomIdByUserId.get(user.id);
    if (activeRoomId && activeRoomId !== roomId) {
      const activeRoom = roomsById.get(activeRoomId);
      if (activeRoom?.status === "ended") {
        removeUserFromRoom(user.id, activeRoom);
      } else {
        return { ok: false, reason: "already_in_other_room" };
      }
    }

    const existingSeat = findUserSeat(room, user.id);
    if (existingSeat) {
      return { ok: true, room: cloneRoom(room) };
    }

    const seat = room.seats.find((candidate) => !candidate.userId && !candidate.isBot);
    if (!seat) {
      return { ok: false, reason: "full" };
    }

    seat.userId = user.id;
    seat.username = user.username;
    seat.isReady = true;
    room.updatedAt = new Date().toISOString();
    activeRoomIdByUserId.set(user.id, room.roomId);
    notifyRoomUpdated(room);
    return { ok: true, room: cloneRoom(room) };
  }

  function leaveRoom(user: AuthUser): LeaveGameLobbyRoomResult {
    const roomId = activeRoomIdByUserId.get(user.id);
    const room = roomId ? roomsById.get(roomId) : undefined;
    const seat = room ? findUserSeat(room, user.id) : undefined;
    if (!room || !seat) {
      return { ok: false, reason: "not_found" };
    }
    if (room.status === "playing") {
      return { ok: false, reason: "playing" };
    }

    return { ok: true, room: removeUserFromRoom(user.id, room) };
  }

  function setReady(user: AuthUser, isReady: boolean): SetGameLobbyRoomReadyResult {
    const roomId = activeRoomIdByUserId.get(user.id);
    const room = roomId ? roomsById.get(roomId) : undefined;
    const seat = room ? findUserSeat(room, user.id) : undefined;
    if (!room || !seat) {
      return { ok: false, reason: "not_found" };
    }
    if (room.status !== "waiting") {
      return { ok: false, reason: "already_started" };
    }

    seat.isReady = isReady;
    room.updatedAt = new Date().toISOString();
    notifyRoomUpdated(room);
    return { ok: true, room: cloneRoom(room) };
  }

  function startRoom(user: AuthUser): StartGameLobbyRoomResult {
    const roomId = activeRoomIdByUserId.get(user.id);
    const room = roomId ? roomsById.get(roomId) : undefined;
    if (!room || !findUserSeat(room, user.id)) {
      return { ok: false, reason: "not_found" };
    }
    if (room.ownerUserId !== user.id) {
      return { ok: false, reason: "forbidden" };
    }
    if (room.status !== "waiting") {
      return { ok: false, reason: "already_started" };
    }
    if (!areHumanSeatsReady(room)) {
      return { ok: false, reason: "not_ready" };
    }

    fillEmptySeatsWithBots(room);
    room.status = "playing";
    room.updatedAt = new Date().toISOString();
    notifyRoomUpdated(room);
    return { ok: true, room: cloneRoom(room) };
  }

  function finishRoom(roomId: string): FinishGameLobbyRoomResult {
    const room = roomsById.get(roomId);
    if (!room) {
      return { ok: false, reason: "not_found" };
    }

    if (room.status !== "ended") {
      room.status = "ended";
      room.updatedAt = new Date().toISOString();
      notifyRoomUpdated(room);
    }

    return { ok: true, room: cloneRoom(room) };
  }

  function replacePlayerWithBot(user: AuthUser, roomId: string): ReplaceLobbyPlayerWithBotResult {
    const room = roomsById.get(roomId);
    const seat = room ? findUserSeat(room, user.id) : undefined;
    if (!room || !seat) {
      activeRoomIdByUserId.delete(user.id);
      return { ok: false, reason: "not_found" };
    }
    if (room.status !== "playing") {
      return { ok: false, reason: "not_playing" };
    }

    activeRoomIdByUserId.delete(user.id);
    delete seat.userId;
    seat.isBot = true;
    seat.isReady = true;
    seat.username = `${user.username}托管Bot`;

    if (room.ownerUserId === user.id) {
      const nextOwnerSeat = findNextHumanSeat(room);
      if (nextOwnerSeat?.userId) {
        room.ownerUserId = nextOwnerSeat.userId;
      }
    }

    if (!hasHumanSeats(room)) {
      room.status = "ended";
    }
    room.updatedAt = new Date().toISOString();
    notifyRoomUpdated(room);
    return { ok: true, room: cloneRoom(room) };
  }

  function resetRoomForRematch(user: AuthUser): ResetGameLobbyRoomResult {
    const roomId = activeRoomIdByUserId.get(user.id);
    const room = roomId ? roomsById.get(roomId) : undefined;
    if (!room || !findUserSeat(room, user.id)) {
      return { ok: false, reason: "not_found" };
    }
    if (room.ownerUserId !== user.id) {
      return { ok: false, reason: "forbidden" };
    }
    if (room.status !== "ended") {
      return { ok: false, reason: "not_ended" };
    }

    for (const seat of room.seats) {
      if (seat.isBot) {
        clearSeat(seat);
        continue;
      }

      seat.isReady = seat.userId === room.ownerUserId;
    }
    room.status = "waiting";
    room.updatedAt = new Date().toISOString();
    notifyRoomUpdated(room);
    return { ok: true, room: cloneRoom(room) };
  }

  function subscribeRoomUpdates(listener: GameLobbyRoomListener): () => void {
    roomListeners.add(listener);
    return () => {
      roomListeners.delete(listener);
    };
  }

  return {
    cleanupExpiredRooms,
    clearEndedRoomMembership,
    createRoom,
    finishRoom,
    getCurrentRoom,
    joinRoom,
    leaveRoom,
    listRooms,
    replacePlayerWithBot,
    resetRoomForRematch,
    restorePlayingRoom,
    setReady,
    startRoom,
    subscribeRoomUpdates
  };
}

export type GameLobbyService = ReturnType<typeof createGameLobbyService>;
