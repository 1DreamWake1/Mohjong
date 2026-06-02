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
});
