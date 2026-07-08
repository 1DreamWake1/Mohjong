import type { AuthUser } from "@mahjong/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cancelDisconnectGrace,
  getDisconnectGraceKey,
  getGameSocketAccessError,
  getGameStartMode,
  humanActionTimeoutMs,
  playerDisconnectGraceMs,
  scheduleDisconnectGrace,
  readSocketToken
} from "./socketServer.js";

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
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads a non-empty socket auth token", () => {
    expect(readSocketToken("token-a")).toBe("token-a");
    expect(readSocketToken("")).toBeNull();
    expect(readSocketToken(undefined)).toBeNull();
    expect(readSocketToken(["token-a"])).toBeNull();
  });

  it("allows players to use game socket operations", () => {
    expect(getGameSocketAccessError(player, "join")).toBeNull();
    expect(getGameSocketAccessError(player, "leave")).toBeNull();
    expect(getGameSocketAccessError(player, "start")).toBeNull();
    expect(getGameSocketAccessError(player, "action")).toBeNull();
    expect(getGameSocketAccessError(player, "sync")).toBeNull();
    expect(getGameSocketAccessError(player, "lobby")).toBeNull();
  });

  it("rejects administrators from player-only game socket operations", () => {
    expect(getGameSocketAccessError(admin, "join")).toBe("Only players can join games");
    expect(getGameSocketAccessError(admin, "leave")).toBe("Only players can leave games");
    expect(getGameSocketAccessError(admin, "start")).toBe("Only players can start games");
    expect(getGameSocketAccessError(admin, "action")).toBe("Only players can act in games");
    expect(getGameSocketAccessError(admin, "sync")).toBe("Only players can sync games");
    expect(getGameSocketAccessError(admin, "lobby")).toBe("Only players can watch lobby rooms");
  });

  it("uses a 30 second human action timeout", () => {
    expect(humanActionTimeoutMs).toBe(30_000);
  });

  it("uses a 20 second player disconnect grace period", () => {
    expect(playerDisconnectGraceMs).toBe(20_000);
    expect(getDisconnectGraceKey("room-1", player.id)).toBe("room-1:1");
  });

  it("runs disconnect takeover only after the grace period", () => {
    vi.useFakeTimers();
    const pendingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
    const onExpire = vi.fn();

    scheduleDisconnectGrace({ key: "room-1:1", onExpire, pendingTimeouts });
    vi.advanceTimersByTime(playerDisconnectGraceMs - 1);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(pendingTimeouts.size).toBe(0);
  });

  it("cancels disconnect takeover when the player reconnects", () => {
    vi.useFakeTimers();
    const pendingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
    const onExpire = vi.fn();
    const key = "room-1:1";

    scheduleDisconnectGrace({ key, onExpire, pendingTimeouts });
    expect(cancelDisconnectGrace(pendingTimeouts, key)).toBe(true);
    vi.advanceTimersByTime(playerDisconnectGraceMs);

    expect(onExpire).not.toHaveBeenCalled();
    expect(cancelDisconnectGrace(pendingTimeouts, key)).toBe(false);
  });

  it("starts a quick room when no active room exists and syncs otherwise", () => {
    expect(getGameStartMode(false)).toBe("create-quick-room");
    expect(getGameStartMode(true)).toBe("sync-active-room");
  });
});
