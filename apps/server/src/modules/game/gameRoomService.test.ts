import { describe, expect, it } from "vitest";

import { createGameRoomService } from "./gameRoomService.js";
import type { AuthUser } from "@mahjong/shared";

const player: AuthUser = {
  createdAt: "2026-06-01T00:00:00.000Z",
  id: 10,
  role: "player",
  updatedAt: "2026-06-01T00:00:00.000Z",
  username: "player-a"
};

describe("gameRoomService", () => {
  it("creates a quick room with one human player and three bots", () => {
    const service = createGameRoomService();
    const room = service.getOrCreateQuickRoom(player);
    const view = service.getPlayerView(room);

    expect(view.username).toBe("player-a");
    expect(view.seatIndex).toBe(0);
    expect(view.handTiles).toHaveLength(14);
    expect(view.otherPlayers).toHaveLength(3);
    expect(view.otherPlayers.every((otherPlayer) => otherPlayer.isBot)).toBe(true);
    expect(view.otherPlayers.map((otherPlayer) => otherPlayer.username)).toEqual([
      "玩家Bot1",
      "玩家Bot2",
      "玩家Bot3"
    ]);
  });

  it("uses simple suited-only rules for quick rooms", () => {
    const service = createGameRoomService();
    const room = service.getOrCreateQuickRoom(player);
    const allVisibleTiles = [
      ...room.state.wall,
      ...room.state.players.flatMap((roomPlayer) => roomPlayer.handTiles)
    ];

    expect(room.state.rules).toMatchObject({
      allowChi: false,
      useDragons: false,
      useWinds: false
    });
    expect(allVisibleTiles.every((tile) => tile.suit !== "winds" && tile.suit !== "dragons")).toBe(true);
    expect(service.getPlayerView(room).availableActions.some((action) => action.type === "chi")).toBe(false);
  });

  it("rejects illegal human actions without changing the active view", () => {
    const service = createGameRoomService();
    const room = service.getOrCreateQuickRoom(player);
    const beforeView = service.getPlayerView(room);
    const otherTileId = room.state.players[1].handTiles[0]?.id;

    if (!otherTileId) {
      throw new Error("Expected bot player to have a tile");
    }

    const result = service.applyHumanAction(player, {
      tileId: otherTileId,
      type: "discard"
    });

    expect(result?.error).toBe("Cannot discard a tile outside player's hand");
    expect(service.getPlayerView(room).handTiles).toHaveLength(beforeView.handTiles.length);
  });

  it("applies legal human actions and can advance bot turns", () => {
    const service = createGameRoomService();
    const room = service.getOrCreateQuickRoom(player);
    const tileId = room.state.players[0].handTiles[0]?.id;

    if (!tileId) {
      throw new Error("Expected human player to have a tile");
    }

    const result = service.applyHumanAction(player, { tileId, type: "discard" });
    expect(result?.error).toBeUndefined();

    const progressed = service.applyNextBotAction(room);
    expect(typeof progressed).toBe("boolean");
    expect(service.getPlayerView(room).roomId).toBe(room.id);
  });

  it("starts a new quick room after the active room has ended", () => {
    const service = createGameRoomService();
    const endedRoom = service.getOrCreateQuickRoom(player);

    endedRoom.state.phase = "ended";
    endedRoom.state.endReason = "draw";

    const nextRoom = service.getOrCreateQuickRoom(player);

    expect(nextRoom.id).not.toBe(endedRoom.id);
    expect(nextRoom.state.phase).toBe("playing");
    expect(service.getRoomForUser(player)?.id).toBe(nextRoom.id);
  });
});
