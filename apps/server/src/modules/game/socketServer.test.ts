import type { AuthUser } from "@mahjong/shared";
import { describe, expect, it } from "vitest";

import { getGameSocketAccessError, readSocketToken } from "./socketServer.js";

const player: AuthUser = {
  createdAt: "2026-06-01T00:00:00.000Z",
  id: 1,
  role: "player",
  updatedAt: "2026-06-01T00:00:00.000Z",
  username: "player"
};

const admin: AuthUser = {
  ...player,
  id: 2,
  role: "admin",
  username: "admin"
};

describe("socketServer", () => {
  it("reads a non-empty socket auth token", () => {
    expect(readSocketToken("token-a")).toBe("token-a");
    expect(readSocketToken("")).toBeNull();
    expect(readSocketToken(undefined)).toBeNull();
    expect(readSocketToken(["token-a"])).toBeNull();
  });

  it("allows players to use game socket operations", () => {
    expect(getGameSocketAccessError(player, "join")).toBeNull();
    expect(getGameSocketAccessError(player, "start")).toBeNull();
    expect(getGameSocketAccessError(player, "action")).toBeNull();
    expect(getGameSocketAccessError(player, "sync")).toBeNull();
  });

  it("rejects administrators from player-only game socket operations", () => {
    expect(getGameSocketAccessError(admin, "join")).toBe("Only players can join games");
    expect(getGameSocketAccessError(admin, "start")).toBe("Only players can start games");
    expect(getGameSocketAccessError(admin, "action")).toBe("Only players can act in games");
    expect(getGameSocketAccessError(admin, "sync")).toBe("Only players can sync games");
  });
});
