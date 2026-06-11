import type { AuthUser } from "@mahjong/shared";
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
});
