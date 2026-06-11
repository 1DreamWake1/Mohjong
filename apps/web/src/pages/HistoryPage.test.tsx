import { describe, expect, it, vi } from "vitest";

import { getGameHistoryResultText, sortGameHistory } from "./HistoryPage.js";

vi.mock("../api/client.js", () => ({
  getGameHistory: vi.fn(),
  listGameHistory: vi.fn()
}));

vi.mock("../stores/authStore.js", () => ({
  useAuthStore: (selector: (state: { clearSession: () => void; signOut: () => Promise<void> }) => unknown) =>
    selector({ clearSession: vi.fn(), signOut: vi.fn() })
}));

describe("HistoryPage", () => {
  it("formats game history result text", () => {
    expect(
      getGameHistoryResultText({
        roomId: "quick-1",
        ruleName: "simple",
        startedAt: "2026-06-09T10:00:00.000Z",
        status: "playing"
      })
    ).toBe("进行中");
    expect(
      getGameHistoryResultText({
        endReason: "draw",
        roomId: "quick-2",
        ruleName: "simple",
        startedAt: "2026-06-09T10:00:00.000Z",
        status: "ended"
      })
    ).toBe("流局");
    expect(
      getGameHistoryResultText({
        endReason: "hu",
        roomId: "quick-3",
        ruleName: "simple",
        startedAt: "2026-06-09T10:00:00.000Z",
        status: "ended",
        totalPoints: 40,
        winType: "selfDraw"
      })
    ).toBe("自摸，40 分");
  });

  it("sorts newest game history first", () => {
    expect(
      sortGameHistory([
        {
          roomId: "old",
          ruleName: "simple",
          startedAt: "2026-06-09T09:00:00.000Z",
          status: "ended"
        },
        {
          roomId: "new",
          ruleName: "simple",
          startedAt: "2026-06-09T10:00:00.000Z",
          status: "playing"
        }
      ]).map((record) => record.roomId)
    ).toEqual(["new", "old"]);
  });
});
