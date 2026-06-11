import { describe, expect, it, vi } from "vitest";

import { canStartLobbyRoom, getLobbySeatText } from "./LobbyPage.js";

vi.mock("../api/client.js", () => ({
  createGameRoom: vi.fn(),
  getCurrentGameRoom: vi.fn(),
  joinGameRoom: vi.fn()
}));

vi.mock("../stores/authStore.js", () => ({
  useAuthStore: (selector: (state: { clearSession: () => void; signOut: () => Promise<void> }) => unknown) =>
    selector({ clearSession: vi.fn(), signOut: vi.fn() })
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
          seats: room.seats.map((seat) =>
            seat.userId === 2 ? { ...seat, isReady: false } : seat
          )
        },
        1
      )
    ).toBe(false);
  });
});
