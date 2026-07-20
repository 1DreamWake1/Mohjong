import type { AdminGameHistoryItem } from "@mahjong/shared";
import { describe, expect, it, vi } from "vitest";

import { filterAdminGameRecords } from "./AdminUsersPage.js";

vi.mock("../api/client.js", () => ({
  createPlayer: vi.fn(),
  deletePlayer: vi.fn(),
  getAdminGameRecord: vi.fn(),
  listAdminActiveRooms: vi.fn(),
  listAdminPersistenceDiagnostics: vi.fn(),
  listAdminGameRecords: vi.fn(),
  listPlayers: vi.fn(),
  resetPlayerPassword: vi.fn()
}));

vi.mock("../stores/authStore.js", () => ({
  useAuthStore: vi.fn()
}));

const records: AdminGameHistoryItem[] = [
  {
    playerUserId: 12,
    playerUsername: "alice",
    roomId: "room-playing",
    ruleName: "simple",
    ruleVersion: 1,
    startedAt: "2026-07-08T09:00:00.000Z",
    status: "playing"
  },
  {
    endReason: "draw",
    roomId: "room-ended",
    ruleName: "standard",
    ruleVersion: 1,
    startedAt: "2026-07-08T08:00:00.000Z",
    status: "ended"
  },
  {
    endReason: "abnormal",
    roomId: "room-abnormal",
    ruleName: "simple",
    ruleVersion: 1,
    startedAt: "2026-07-08T07:00:00.000Z",
    status: "ended"
  }
];

describe("AdminUsersPage game filters", () => {
  it("filters records by room id and operational status", () => {
    expect(filterAdminGameRecords(records, "PLAYING", "all")).toHaveLength(1);
    expect(filterAdminGameRecords(records, "alice", "all")).toHaveLength(1);
    expect(filterAdminGameRecords(records, "12", "all")).toHaveLength(1);
    expect(filterAdminGameRecords(records, "", "playing").map((record) => record.roomId)).toEqual([
      "room-playing"
    ]);
    expect(filterAdminGameRecords(records, "", "ended")).toHaveLength(2);
    expect(filterAdminGameRecords(records, "", "abnormal").map((record) => record.roomId)).toEqual([
      "room-abnormal"
    ]);
  });

  it("filters records by result and inclusive start date range", () => {
    expect(filterAdminGameRecords(records, "", "all", "draw")).toEqual([records[1]]);
    expect(filterAdminGameRecords(records, "", "all", "abnormal")).toEqual([records[2]]);
    expect(
      filterAdminGameRecords(records, "", "all", "all", "2026-07-08", "2026-07-08")
    ).toHaveLength(3);
    expect(filterAdminGameRecords(records, "", "all", "all", "2026-07-09")).toHaveLength(0);
  });
});
