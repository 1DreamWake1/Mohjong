import type { AuthUser } from "@mahjong/shared";
import { createInitialGame, simpleRuleConfig } from "mahjong-core";
import { describe, expect, it } from "vitest";

import { createGameLobbyService } from "./gameLobbyService.js";

function createPlayer(id: number, username: string): AuthUser {
  return {
    createdAt: "2026-06-11T00:00:00.000Z",
    id,
    role: "player",
    updatedAt: "2026-06-11T00:00:00.000Z",
    username
  };
}

describe("gameLobbyService", () => {
  it("creates a waiting room with the owner seated", () => {
    const service = createGameLobbyService();
    const room = service.createRoom(createPlayer(1, "player1"));

    expect(room).toMatchObject({
      ownerUserId: 1,
      ruleName: "simple",
      ruleVersion: 1,
      roomId: "room-0001",
      status: "waiting"
    });
    expect(room.seats).toHaveLength(4);
    expect(room.seats[0]).toMatchObject({
      isReady: true,
      seatIndex: 0,
      userId: 1,
      username: "player1"
    });
  });

  it("stores the selected rule preset on a new room", () => {
    const service = createGameLobbyService();

    expect(service.createRoom(createPlayer(1, "player1"), "standard")).toMatchObject({
      ruleName: "standard",
      ruleVersion: 1
    });
  });

  it("allows players to join the first available seat", () => {
    const service = createGameLobbyService();
    const room = service.createRoom(createPlayer(1, "player1"));
    const joinResult = service.joinRoom(createPlayer(2, "player2"), room.roomId);

    expect(joinResult).toMatchObject({
      ok: true,
      room: {
        seats: expect.arrayContaining([
          expect.objectContaining({
            seatIndex: 1,
            userId: 2,
            username: "player2"
          })
        ])
      }
    });
  });

  it("rejects joining a full room", () => {
    const service = createGameLobbyService();
    const room = service.createRoom(createPlayer(1, "player1"));
    service.joinRoom(createPlayer(2, "player2"), room.roomId);
    service.joinRoom(createPlayer(3, "player3"), room.roomId);
    service.joinRoom(createPlayer(4, "player4"), room.roomId);

    expect(service.joinRoom(createPlayer(5, "player5"), room.roomId)).toEqual({
      ok: false,
      reason: "full"
    });
  });

  it("returns the current room for seated players", () => {
    const service = createGameLobbyService();
    const player = createPlayer(1, "player1");
    const room = service.createRoom(player);

    expect(service.getCurrentRoom(player)?.roomId).toBe(room.roomId);
  });

  it("allows players to leave waiting rooms and clears their seat", () => {
    const service = createGameLobbyService();
    const owner = createPlayer(1, "player1");
    const joiner = createPlayer(2, "player2");
    const room = service.createRoom(owner);
    service.joinRoom(joiner, room.roomId);

    const leaveResult = service.leaveRoom(joiner);

    expect(leaveResult).toMatchObject({
      ok: true,
      room: {
        ownerUserId: owner.id
      }
    });
    if (!leaveResult.ok || !leaveResult.room) {
      throw new Error("Expected leave result to include a room");
    }
    const clearedSeat = leaveResult.room.seats[1];
    expect(clearedSeat).toMatchObject({
      isBot: false,
      isReady: false,
      seatIndex: 1
    });
    expect(clearedSeat?.userId).toBeUndefined();
    expect(clearedSeat?.username).toBeUndefined();
    expect(service.getCurrentRoom(joiner)).toBeNull();
  });

  it("transfers ownership when the owner leaves a waiting room", () => {
    const service = createGameLobbyService();
    const owner = createPlayer(1, "player1");
    const joiner = createPlayer(2, "player2");
    const room = service.createRoom(owner);
    service.joinRoom(joiner, room.roomId);

    const leaveResult = service.leaveRoom(owner);

    expect(leaveResult).toMatchObject({
      ok: true,
      room: {
        ownerUserId: joiner.id
      }
    });
    if (!leaveResult.ok || !leaveResult.room) {
      throw new Error("Expected leave result to include a room");
    }
    expect(leaveResult.room.seats[0]?.userId).toBeUndefined();
    expect(leaveResult.room.seats[1]).toMatchObject({
      seatIndex: 1,
      userId: joiner.id
    });
  });

  it("removes empty waiting rooms after the last player leaves", () => {
    const service = createGameLobbyService();
    const owner = createPlayer(1, "player1");
    service.createRoom(owner);

    expect(service.leaveRoom(owner)).toEqual({ ok: true, room: null });
    expect(service.getCurrentRoom(owner)).toBeNull();
  });

  it("allows players to leave ended rooms", () => {
    const service = createGameLobbyService();
    const owner = createPlayer(1, "player1");
    const room = service.createRoom(owner);
    service.startRoom(owner);
    service.finishRoom(room.roomId);

    expect(service.leaveRoom(owner)).toEqual({ ok: true, room: null });
    expect(service.getCurrentRoom(owner)).toBeNull();
  });

  it("allows players in ended rooms to join another waiting room", () => {
    const service = createGameLobbyService();
    const player = createPlayer(1, "player1");
    const endedRoom = service.createRoom(player);
    service.startRoom(player);
    service.finishRoom(endedRoom.roomId);
    const nextRoom = service.createRoom(createPlayer(2, "player2"));

    expect(service.joinRoom(player, nextRoom.roomId)).toMatchObject({
      ok: true,
      room: {
        roomId: nextRoom.roomId,
        seats: expect.arrayContaining([
          expect.objectContaining({ userId: player.id, username: player.username })
        ])
      }
    });
    expect(service.getCurrentRoom(player)?.roomId).toBe(nextRoom.roomId);
  });

  it("clears ended room membership when creating a new room", () => {
    const service = createGameLobbyService();
    const player = createPlayer(1, "player1");
    const endedRoom = service.createRoom(player);
    service.startRoom(player);
    service.finishRoom(endedRoom.roomId);

    const nextRoom = service.createRoom(player);

    expect(nextRoom.roomId).not.toBe(endedRoom.roomId);
    expect(nextRoom.status).toBe("waiting");
    expect(service.getCurrentRoom(player)?.roomId).toBe(nextRoom.roomId);
  });

  it("keeps players in active playing rooms from creating another room", () => {
    const service = createGameLobbyService();
    const player = createPlayer(1, "player1");
    const room = service.createRoom(player);
    service.startRoom(player);

    const currentRoom = service.createRoom(player);

    expect(currentRoom.roomId).toBe(room.roomId);
    expect(currentRoom.status).toBe("playing");
    expect(service.getCurrentRoom(player)?.roomId).toBe(room.roomId);
  });

  it("keeps players in active rooms from joining another room", () => {
    const service = createGameLobbyService();
    const player = createPlayer(1, "player1");
    service.createRoom(player);
    const otherRoom = service.createRoom(createPlayer(2, "player2"));

    expect(service.joinRoom(player, otherRoom.roomId)).toEqual({
      ok: false,
      reason: "already_in_other_room"
    });
  });

  it("rejects leaving rooms while a game is playing", () => {
    const service = createGameLobbyService();
    const owner = createPlayer(1, "player1");
    service.createRoom(owner);
    service.startRoom(owner);

    expect(service.leaveRoom(owner)).toEqual({ ok: false, reason: "playing" });
  });

  it("notifies subscribers when rooms change", () => {
    const service = createGameLobbyService();
    const updates: string[] = [];
    const unsubscribe = service.subscribeRoomUpdates((room) => {
      updates.push(`${room.roomId}:${room.seats.filter((seat) => seat.userId).length}`);
    });

    const room = service.createRoom(createPlayer(1, "player1"));
    service.joinRoom(createPlayer(2, "player2"), room.roomId);
    unsubscribe();
    service.joinRoom(createPlayer(3, "player3"), room.roomId);

    expect(updates).toEqual([`${room.roomId}:1`, `${room.roomId}:2`]);
  });

  it("tracks ready state and starts with bot-filled empty seats", () => {
    const service = createGameLobbyService();
    const owner = createPlayer(1, "player1");
    const joiner = createPlayer(2, "player2");
    const room = service.createRoom(owner);
    service.joinRoom(joiner, room.roomId);
    expect(service.setReady(joiner, false)).toMatchObject({
      ok: true,
      room: {
        seats: expect.arrayContaining([
          expect.objectContaining({ isReady: false, username: "player2" })
        ])
      }
    });
    expect(service.startRoom(owner)).toEqual({ ok: false, reason: "not_ready" });

    service.setReady(joiner, true);
    const startResult = service.startRoom(owner);

    expect(startResult).toMatchObject({
      ok: true,
      room: {
        status: "playing",
        seats: expect.arrayContaining([
          expect.objectContaining({ isBot: true, isReady: true, seatIndex: 2 }),
          expect.objectContaining({ isBot: true, isReady: true, seatIndex: 3 })
        ])
      }
    });
  });

  it("allows only the owner to start the room", () => {
    const service = createGameLobbyService();
    const room = service.createRoom(createPlayer(1, "player1"));
    const joiner = createPlayer(2, "player2");
    service.joinRoom(joiner, room.roomId);

    expect(service.startRoom(joiner)).toEqual({ ok: false, reason: "forbidden" });
  });

  it("marks playing rooms as ended and notifies subscribers", () => {
    const service = createGameLobbyService();
    const updates: string[] = [];
    service.subscribeRoomUpdates((room) => {
      updates.push(`${room.roomId}:${room.status}`);
    });
    const owner = createPlayer(1, "player1");
    const room = service.createRoom(owner);
    const startResult = service.startRoom(owner);
    if (!startResult.ok) {
      throw new Error("Expected room to start");
    }

    expect(service.finishRoom(room.roomId)).toMatchObject({
      ok: true,
      room: {
        roomId: room.roomId,
        status: "ended"
      }
    });
    expect(service.getCurrentRoom(owner)).toMatchObject({
      roomId: room.roomId,
      status: "ended"
    });
    expect(updates).toContain(`${room.roomId}:ended`);
  });

  it("replaces a playing room player with a bot", () => {
    const service = createGameLobbyService();
    const owner = createPlayer(1, "player1");
    const joiner = createPlayer(2, "player2");
    const room = service.createRoom(owner);
    service.joinRoom(joiner, room.roomId);
    service.startRoom(owner);

    expect(service.replacePlayerWithBot(owner, room.roomId)).toMatchObject({
      ok: true,
      room: {
        ownerUserId: joiner.id,
        status: "playing",
        seats: expect.arrayContaining([
          expect.objectContaining({
            isBot: true,
            seatIndex: 0,
            username: "player1托管Bot"
          })
        ])
      }
    });
    expect(service.getCurrentRoom(owner)).toBeNull();
    expect(service.getCurrentRoom(joiner)?.ownerUserId).toBe(joiner.id);
  });

  it("ends a playing room when no human players remain", () => {
    const service = createGameLobbyService();
    const owner = createPlayer(1, "player1");
    const room = service.createRoom(owner);
    service.startRoom(owner);

    expect(service.replacePlayerWithBot(owner, room.roomId)).toMatchObject({
      ok: true,
      room: {
        status: "ended",
        seats: expect.arrayContaining([
          expect.objectContaining({
            isBot: true,
            seatIndex: 0,
            username: "player1托管Bot"
          })
        ])
      }
    });
    expect(service.getCurrentRoom(owner)).toBeNull();
  });

  it("resets an ended room for a rematch with the original human members", () => {
    const service = createGameLobbyService();
    const owner = createPlayer(1, "player1");
    const joiner = createPlayer(2, "player2");
    const room = service.createRoom(owner);
    service.joinRoom(joiner, room.roomId);
    service.startRoom(owner);
    service.finishRoom(room.roomId);

    expect(service.resetRoomForRematch(joiner)).toEqual({
      ok: false,
      reason: "forbidden"
    });
    expect(service.resetRoomForRematch(owner)).toMatchObject({
      ok: true,
      room: {
        roomId: room.roomId,
        status: "waiting",
        seats: [
          expect.objectContaining({ isReady: true, userId: owner.id }),
          expect.objectContaining({ isReady: false, userId: joiner.id }),
          expect.objectContaining({ isBot: false, isReady: false }),
          expect.objectContaining({ isBot: false, isReady: false })
        ]
      }
    });
  });

  it("restores a playing lobby room from a recovery snapshot", () => {
    const service = createGameLobbyService();
    const owner = createPlayer(1, "player1");
    const state = createInitialGame({
      players: [
        { isBot: false, username: owner.username },
        { isBot: true, username: "玩家Bot1" },
        { isBot: true, username: "玩家Bot2" },
        { isBot: true, username: "玩家Bot3" }
      ],
      rules: simpleRuleConfig,
      seed: 1
    });

    expect(
      service.restorePlayingRoom({
        events: [],
        humanSeatIndex: 0,
        humanSeats: [{ seatIndex: 0, userId: owner.id }],
        lobbyRoomId: "room-restored",
        playerUserId: owner.id,
        roomId: "room-restored-round-0001",
        state,
        version: 1
      })
    ).toMatchObject({
      ownerUserId: owner.id,
      roomId: "room-restored",
      seats: [
        expect.objectContaining({ isBot: false, userId: owner.id }),
        expect.objectContaining({ isBot: true }),
        expect.objectContaining({ isBot: true }),
        expect.objectContaining({ isBot: true })
      ],
      status: "playing"
    });
    expect(service.getCurrentRoom(owner)?.roomId).toBe("room-restored");
  });

  it("cleans up expired waiting and ended rooms but keeps playing rooms", () => {
    const waitingService = createGameLobbyService();
    const waitingPlayer = createPlayer(20, "waiting-player");
    const waitingRoom = waitingService.createRoom(waitingPlayer);
    const waitingNowMs = Date.parse(waitingRoom.updatedAt) + 1_001;
    expect(
      waitingService.cleanupExpiredRooms({
        endedRoomTtlMs: 500,
        nowMs: waitingNowMs,
        waitingRoomTtlMs: 1_000
      })
    ).toEqual([waitingRoom.roomId]);
    expect(waitingService.getCurrentRoom(waitingPlayer)).toBeNull();

    const endedService = createGameLobbyService();
    const endedPlayer = createPlayer(21, "ended-player");
    const endedRoom = endedService.createRoom(endedPlayer);
    endedService.startRoom(endedPlayer);
    const finishedRoom = endedService.finishRoom(endedRoom.roomId);
    if (!finishedRoom.ok) {
      throw new Error("Expected room to finish");
    }
    expect(
      endedService.cleanupExpiredRooms({
        endedRoomTtlMs: 1_000,
        nowMs: Date.parse(finishedRoom.room.updatedAt) + 1_001,
        waitingRoomTtlMs: 5_000
      })
    ).toEqual([endedRoom.roomId]);
    expect(endedService.getCurrentRoom(endedPlayer)).toBeNull();

    const playingService = createGameLobbyService();
    const playingPlayer = createPlayer(22, "playing-player");
    const playingRoom = playingService.createRoom(playingPlayer);
    playingService.startRoom(playingPlayer);
    expect(
      playingService.cleanupExpiredRooms({
        endedRoomTtlMs: 1,
        nowMs: Date.parse(playingRoom.updatedAt) + 10_000,
        waitingRoomTtlMs: 1
      })
    ).toEqual([]);
    expect(playingService.getCurrentRoom(playingPlayer)?.status).toBe("playing");
  });
});
