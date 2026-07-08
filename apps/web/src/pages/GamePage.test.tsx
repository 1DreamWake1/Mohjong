import { describe, expect, it, vi } from "vitest";

import {
  canRestartGame,
  getGameEndAction,
  getGameConnectRequest,
  getGameResultSummary,
  getReturnToLobbyConfirmation,
  getRecentGameEvents,
  getSignOutDuringGameConfirmation
} from "./GamePage.js";

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

  it("starts a quick room when no live room has been assigned", () => {
    expect(getGameConnectRequest("")).toEqual({
      event: "game:start"
    });
  });

  it("allows restarting only after the live game ends", () => {
    expect(canRestartGame("ended")).toBe(true);
    expect(canRestartGame("playing")).toBe(false);
    expect(canRestartGame("waiting")).toBe(false);
  });

  it("restarts quick games directly and returns multiplayer games to their room", () => {
    expect(getGameEndAction("quick-0001")).toBe("restart");
    expect(getGameEndAction("room-0001-round-0001")).toBe("return-to-room");
  });

  it("describes return-to-lobby consequences before leaving active games", () => {
    expect(getReturnToLobbyConfirmation("playing", "quick-0001")).toBe(
      "返回大厅将直接结束当前单人牌局，确认返回？"
    );
    expect(getReturnToLobbyConfirmation("playing", "room-0001")).toBe(
      "返回大厅后将由机器人接手你的座位继续牌局，确认返回？"
    );
    expect(getReturnToLobbyConfirmation("ended", "room-0001")).toBeNull();
  });

  it("describes sign-out consequences before leaving active games", () => {
    expect(getSignOutDuringGameConfirmation("playing", "quick-0001")).toBe(
      "退出登录将直接结束当前单人牌局，确认退出？"
    );
    expect(getSignOutDuringGameConfirmation("playing", "room-0001")).toBe(
      "退出登录后将由机器人接手你的座位继续牌局，确认退出？"
    );
    expect(getSignOutDuringGameConfirmation("ended", "room-0001")).toBeNull();
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

  it("formats winning result summaries", () => {
    expect(
      getGameResultSummary({
        endReason: "hu",
        fanTotal: 2,
        fans: [
          { name: "平和", value: 1 },
          { name: "断幺九", value: 1 }
        ],
        totalPoints: 40,
        winType: "selfDraw",
        winningTile: {
          id: "tile-a",
          label: "8筒",
          rank: 8,
          suit: "dots"
        }
      })
    ).toEqual({
      fanText: "平和 1番、断幺九 1番",
      scoreText: "40 分",
      title: "胡牌结算",
      winTypeText: "自摸",
      winningTileText: "胡牌：8筒"
    });
  });

  it("formats draw result summaries", () => {
    expect(
      getGameResultSummary({
        endReason: "draw",
        fanTotal: 0,
        fans: [],
        totalPoints: 0
      })
    ).toEqual({
      fanText: null,
      scoreText: "无人胡牌",
      title: "流局",
      winTypeText: null,
      winningTileText: null
    });
  });
});
