import { describe, expect, it, vi } from "vitest";

import {
  filterGameHistory,
  getGameHistoryFanText,
  getGameHistoryResultText,
  getNextReplayIndex,
  getReplayProgressText,
  sortGameHistory
} from "./HistoryPage.js";

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

  it("formats fan text from game history result snapshots", () => {
    expect(
      getGameHistoryFanText({
        events: [],
        result: {
          fanTotal: 3,
          fans: [
            { name: "平和", value: 1 },
            { name: "断幺九", value: 1 }
          ],
          totalPoints: 50
        },
        roomId: "quick-fan",
        ruleName: "simple",
        startedAt: "2026-06-09T10:00:00.000Z",
        status: "ended"
      })
    ).toBe("平和 1番、断幺九 1番");
    expect(
      getGameHistoryFanText({
        events: [],
        roomId: "quick-no-fan",
        ruleName: "simple",
        startedAt: "2026-06-09T10:00:00.000Z",
        status: "playing"
      })
    ).toBeNull();
  });

  it("formats and clamps replay progress", () => {
    expect(getReplayProgressText(0, 0)).toBe("0 / 0");
    expect(getReplayProgressText(0, 3)).toBe("1 / 3");
    expect(getReplayProgressText(5, 3)).toBe("3 / 3");
    expect(getReplayProgressText(-1, 3)).toBe("1 / 3");
  });

  it("moves replay index within event bounds", () => {
    expect(getNextReplayIndex(0, 0, "next")).toBe(0);
    expect(getNextReplayIndex(0, 3, "previous")).toBe(0);
    expect(getNextReplayIndex(1, 3, "previous")).toBe(0);
    expect(getNextReplayIndex(1, 3, "next")).toBe(2);
    expect(getNextReplayIndex(2, 3, "next")).toBe(2);
  });

  it("filters game history by status, result and room id", () => {
    const records = [
      {
        roomId: "quick-playing",
        ruleName: "simple",
        startedAt: "2026-06-09T11:00:00.000Z",
        status: "playing" as const
      },
      {
        endReason: "hu" as const,
        roomId: "quick-hu",
        ruleName: "simple",
        startedAt: "2026-06-09T10:00:00.000Z",
        status: "ended" as const
      },
      {
        endReason: "draw" as const,
        roomId: "quick-draw",
        ruleName: "simple",
        startedAt: "2026-06-09T09:00:00.000Z",
        status: "ended" as const
      }
    ];

    expect(filterGameHistory(records, "playing", "").map((record) => record.roomId)).toEqual([
      "quick-playing"
    ]);
    expect(filterGameHistory(records, "ended", "").map((record) => record.roomId)).toEqual([
      "quick-hu",
      "quick-draw"
    ]);
    expect(filterGameHistory(records, "hu", "").map((record) => record.roomId)).toEqual([
      "quick-hu"
    ]);
    expect(filterGameHistory(records, "draw", "").map((record) => record.roomId)).toEqual([
      "quick-draw"
    ]);
    expect(filterGameHistory(records, "all", "HU").map((record) => record.roomId)).toEqual([
      "quick-hu"
    ]);
  });
});
