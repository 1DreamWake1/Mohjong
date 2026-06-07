import { describe, expect, it, vi } from "vitest";

import { canRestartGame, getGameConnectRequest, getRecentGameEvents } from "./GamePage.js";

vi.mock("../stores/authStore.js", () => ({
  useAuthStore: (selector: (state: { signOut: () => Promise<void> }) => unknown) =>
    selector({ signOut: vi.fn() })
}));

vi.mock("../stores/socketStore.js", () => ({
  useSocketStore: (
    selector: (state: {
      disconnectSocket: () => void;
      prepareSocket: (token: string) => void;
      socket: null;
      status: "idle";
    }) => unknown
  ) =>
    selector({
      disconnectSocket: vi.fn(),
      prepareSocket: vi.fn(),
      socket: null,
      status: "idle"
    })
}));

describe("GamePage", () => {
  it("syncs an existing quick room when the socket reconnects", () => {
    expect(getGameConnectRequest("quick-0007")).toEqual({
      event: "game:sync",
      payload: { gameId: "quick-0007" }
    });
  });

  it("joins a quick room when no live room has been assigned", () => {
    expect(getGameConnectRequest("")).toEqual({
      event: "game:join",
      payload: {}
    });
  });

  it("allows restarting only after the live game ends", () => {
    expect(canRestartGame("ended")).toBe(true);
    expect(canRestartGame("playing")).toBe(false);
    expect(canRestartGame("waiting")).toBe(false);
  });

  it("shows the newest game events first with a bounded list", () => {
    const events = Array.from({ length: 7 }, (_, index) => ({
      createdAt: `2026-06-01T10:00:0${index}.000Z`,
      id: `event-${index}`,
      text: `事件 ${index}`
    }));

    expect(getRecentGameEvents(events).map((event) => event.id)).toEqual([
      "event-6",
      "event-5",
      "event-4",
      "event-3",
      "event-2"
    ]);
  });
});
