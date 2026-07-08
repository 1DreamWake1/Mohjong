import { describe, expect, it, vi } from "vitest";

import {
  canCreateOrJoinLobbyRoom,
  canEnterLobbyGame,
  canLeaveLobbyRoom,
  canResetLobbyRoom,
  canStartLobbyRoom,
  getRulePresetText,
  getLobbyRoomStatusText,
  getLobbySeatText
} from "./LobbyPage.js";

vi.mock("../api/client.js", () => ({
  createGameRoom: vi.fn(),
  getCurrentGameRoom: vi.fn(),
  joinGameRoom: vi.fn(),
  leaveCurrentGameRoom: vi.fn(),
  resetGameRoomForRematch: vi.fn(),
  setGameRoomReady: vi.fn(),
  startGameRoom: vi.fn()
}));

vi.mock("../stores/authStore.js", () => ({
  useAuthStore: (
    selector: (state: { clearSession: () => void; signOut: () => Promise<void> }) => unknown
  ) => selector({ clearSession: vi.fn(), signOut: vi.fn() })
}));

vi.mock("../stores/socketStore.js", () => ({
  useSocketStore: (
    selector: (state: {
      disconnectSocket: () => void;
      prepareSocket: () => void;
      status: "ready";
    }) => unknown
  ) =>
    selector({
      disconnectSocket: vi.fn(),
      prepareSocket: vi.fn(),
      status: "ready"
    })
}));

describe("LobbyPage", () => {
  it("formats room rule presets", () => {
    expect(getRulePresetText("simple")).toBe("简单规则");
    expect(getRulePresetText("standard")).toBe("标准规则");
    expect(getRulePresetText(undefined)).toBe("简单规则");
  });

  it("formats lobby seat text", () => {
    expect(
      getLobbySeatText({
        isBot: false,
        isReady: true,
        seatIndex: 0,
        username: "player1"
      })
    ).toBe("player1");
    expect(
      getLobbySeatText({
        isBot: true,
        isReady: true,
        seatIndex: 1,
        username: "player1托管Bot"
      })
    ).toBe("player1托管Bot");
    expect(
      getLobbySeatText({
        isBot: true,
        isReady: true,
        seatIndex: 1
      })
    ).toBe("Bot");
    expect(
      getLobbySeatText({
        isBot: false,
        isReady: false,
        seatIndex: 2
      })
    ).toBe("空座");
  });

  it("allows only the owner to start when all human players are ready", () => {
    const room = {
      createdAt: "2026-06-11T00:00:00.000Z",
      ownerUserId: 1,
      roomId: "room-0001",
      status: "waiting" as const,
      updatedAt: "2026-06-11T00:00:00.000Z",
      seats: [
        { isBot: false, isReady: true, seatIndex: 0, userId: 1, username: "player1" },
        { isBot: false, isReady: true, seatIndex: 1, userId: 2, username: "player2" },
        { isBot: false, isReady: false, seatIndex: 2 },
        { isBot: false, isReady: false, seatIndex: 3 }
      ]
    };

    expect(canStartLobbyRoom(room, 1)).toBe(true);
    expect(canStartLobbyRoom(room, 2)).toBe(false);
    expect(
      canStartLobbyRoom(
        {
          ...room,
          seats: room.seats.map((seat) => (seat.userId === 2 ? { ...seat, isReady: false } : seat))
        },
        1
      )
    ).toBe(false);
  });

  it("allows entering the table after a lobby room has started", () => {
    const room = {
      createdAt: "2026-06-11T00:00:00.000Z",
      ownerUserId: 1,
      roomId: "room-0001",
      seats: [
        { isBot: false, isReady: true, seatIndex: 0, userId: 1, username: "player1" },
        { isBot: true, isReady: true, seatIndex: 1, username: "玩家Bot1" },
        { isBot: true, isReady: true, seatIndex: 2, username: "玩家Bot2" },
        { isBot: true, isReady: true, seatIndex: 3, username: "玩家Bot3" }
      ],
      status: "playing" as const,
      updatedAt: "2026-06-11T00:00:00.000Z"
    };

    expect(canEnterLobbyGame(room)).toBe(true);
    expect(canEnterLobbyGame({ ...room, status: "waiting" })).toBe(false);
    expect(canEnterLobbyGame({ ...room, status: "ended" })).toBe(false);
    expect(canEnterLobbyGame(null)).toBe(false);
  });

  it("allows leaving waiting and ended lobby rooms", () => {
    const room = {
      createdAt: "2026-06-11T00:00:00.000Z",
      ownerUserId: 1,
      roomId: "room-0001",
      seats: [
        { isBot: false, isReady: true, seatIndex: 0, userId: 1, username: "player1" },
        { isBot: false, isReady: false, seatIndex: 1 },
        { isBot: false, isReady: false, seatIndex: 2 },
        { isBot: false, isReady: false, seatIndex: 3 }
      ],
      status: "waiting" as const,
      updatedAt: "2026-06-11T00:00:00.000Z"
    };

    expect(canLeaveLobbyRoom(room)).toBe(true);
    expect(canLeaveLobbyRoom({ ...room, status: "playing" })).toBe(false);
    expect(canLeaveLobbyRoom({ ...room, status: "ended" })).toBe(true);
    expect(canLeaveLobbyRoom(null)).toBe(false);
  });

  it("allows creating or joining only without an active waiting or playing room", () => {
    const room = {
      createdAt: "2026-06-11T00:00:00.000Z",
      ownerUserId: 1,
      roomId: "room-0001",
      seats: [
        { isBot: false, isReady: true, seatIndex: 0, userId: 1, username: "player1" },
        { isBot: false, isReady: false, seatIndex: 1 },
        { isBot: false, isReady: false, seatIndex: 2 },
        { isBot: false, isReady: false, seatIndex: 3 }
      ],
      status: "waiting" as const,
      updatedAt: "2026-06-11T00:00:00.000Z"
    };

    expect(canCreateOrJoinLobbyRoom(null)).toBe(true);
    expect(canCreateOrJoinLobbyRoom(room)).toBe(false);
    expect(canCreateOrJoinLobbyRoom({ ...room, status: "playing" })).toBe(false);
    expect(canCreateOrJoinLobbyRoom({ ...room, status: "ended" })).toBe(true);
  });

  it("formats lobby room status text", () => {
    const room = {
      createdAt: "2026-06-11T00:00:00.000Z",
      ownerUserId: 1,
      roomId: "room-0001",
      seats: [
        { isBot: false, isReady: true, seatIndex: 0, userId: 1, username: "player1" },
        { isBot: false, isReady: false, seatIndex: 1 },
        { isBot: false, isReady: false, seatIndex: 2 },
        { isBot: false, isReady: false, seatIndex: 3 }
      ],
      status: "waiting" as const,
      updatedAt: "2026-06-11T00:00:00.000Z"
    };

    expect(getLobbyRoomStatusText(room)).toBe("等待中");
    expect(getLobbyRoomStatusText({ ...room, status: "playing" })).toBe("进行中");
    expect(getLobbyRoomStatusText({ ...room, status: "ended" })).toBe("已结束");
    expect(getLobbyRoomStatusText(null)).toBe("-");
  });

  it("allows only the owner to reset an ended room", () => {
    const room = {
      createdAt: "2026-06-11T00:00:00.000Z",
      ownerUserId: 1,
      roomId: "room-0001",
      seats: [],
      status: "ended" as const,
      updatedAt: "2026-06-11T00:00:00.000Z"
    };

    expect(canResetLobbyRoom(room, 1)).toBe(true);
    expect(canResetLobbyRoom(room, 2)).toBe(false);
    expect(canResetLobbyRoom({ ...room, status: "waiting" }, 1)).toBe(false);
  });
});
