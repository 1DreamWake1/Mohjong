import { describe, expect, it } from "vitest";
import { createTile, getLegalActions, type TileCode } from "mahjong-core";

import { createGameRoomService, describeGameEnd } from "./gameRoomService.js";
import { createMemoryGameRecordRepository } from "./gameRecordRepository.js";
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

    expect(result?.error).toBe("Illegal action");
    expect(service.getPlayerView(room).handTiles).toHaveLength(beforeView.handTiles.length);
  });

  it("rejects actions that are not in the current legal action list", () => {
    const service = createGameRoomService();
    const room = service.getOrCreateQuickRoom(player);
    const beforeView = service.getPlayerView(room);

    const result = service.applyHumanAction(player, {
      type: "pass"
    });

    expect(result?.error).toBe("Illegal action");
    expect(service.getPlayerView(room)).toMatchObject({
      currentTurn: beforeView.currentTurn,
      handTiles: beforeView.handTiles
    });
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

  it("auto-plays a legal human action when the player times out", () => {
    const service = createGameRoomService();
    const room = service.getOrCreateQuickRoom(player);

    const progressed = service.applyHumanTimeout(room);

    expect(progressed).toBe(true);
    expect(service.getPlayerView(room).eventMessages.some((event) => event.text.includes("超时托管"))).toBe(true);
  });

  it("does not auto-play a human timeout outside the human player's turn", () => {
    const service = createGameRoomService();
    const room = service.getOrCreateQuickRoom(player);
    const humanPlayer = room.state.players[room.humanSeatIndex];

    if (!humanPlayer) {
      throw new Error("Expected human player to exist");
    }

    const tileId = humanPlayer.handTiles[0]?.id;

    if (!tileId) {
      throw new Error("Expected human player to have a tile");
    }

    const actionResult = service.applyHumanAction(player, { tileId, type: "discard" });
    expect(actionResult?.error).toBeUndefined();

    const beforeView = service.getPlayerView(room);
    expect(service.applyHumanTimeout(room)).toBe(false);
    expect(service.getPlayerView(room)).toMatchObject({
      currentTurn: beforeView.currentTurn,
      handTiles: beforeView.handTiles
    });
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

  it("includes draw result details in the player view", () => {
    const service = createGameRoomService();
    const room = service.getOrCreateQuickRoom(player);

    room.state.phase = "ended";
    room.state.endReason = "draw";

    expect(service.getPlayerView(room)).toMatchObject({
      phase: "ended",
      result: {
        endReason: "draw",
        fanTotal: 0,
        totalPoints: 0
      }
    });
  });

  it("includes winning tile details in the player view", () => {
    const service = createGameRoomService();
    const room = service.getOrCreateQuickRoom(player);
    const winningTile = room.state.players[0].handTiles[0];

    if (!winningTile) {
      throw new Error("Expected player to have a tile");
    }

    room.state.phase = "ended";
    room.state.endReason = "hu";
    room.state.winnerSeatIndex = 0;
    room.state.winningTile = winningTile;
    room.state.winType = "discard";
    room.state.score = {
      basePoints: 20,
      canHu: true,
      fanTotal: 1,
      fans: [{ name: "断幺九", type: "tanyao", value: 1 }],
      totalPoints: 30
    };

    expect(service.getPlayerView(room)).toMatchObject({
      result: {
        endReason: "hu",
        totalPoints: 30,
        winType: "discard",
        winningTile: expect.objectContaining({ id: winningTile.id })
      },
      winnerSeatIndex: 0
    });
  });

  it("describes ended games with result details", () => {
    const service = createGameRoomService();
    const room = service.getOrCreateQuickRoom(player);
    const winningTile = room.state.players[0].handTiles[0];

    if (!winningTile) {
      throw new Error("Expected player to have a tile");
    }

    room.state.phase = "ended";
    room.state.endReason = "hu";
    room.state.winnerSeatIndex = 0;
    room.state.winningTile = winningTile;
    room.state.winType = "selfDraw";
    room.state.score = {
      basePoints: 20,
      canHu: true,
      fanTotal: 1,
      fans: [{ name: "断幺九", type: "tanyao", value: 1 }],
      totalPoints: 30
    };

    expect(describeGameEnd(room.state)).toBe(`player-a 自摸，胡 ${winningTile.label}，30 分`);

    room.state.winType = "discard";
    expect(describeGameEnd(room.state)).toBe(`player-a 点炮，胡 ${winningTile.label}，30 分`);

    room.state.endReason = "draw";
    expect(describeGameEnd(room.state)).toBe("牌局流局");
  });

  it("restores the current active room without an explicit room id", () => {
    const service = createGameRoomService();
    const room = service.getOrCreateQuickRoom(player);

    expect(service.getRoomForUser(player)).toBe(room);
  });

  it("keeps only recent room events", () => {
    const service = createGameRoomService();
    const room = service.getOrCreateQuickRoom(player);

    for (let index = 0; index < 30; index += 1) {
      if (room.state.phase !== "playing") {
        break;
      }

      if (room.state.currentTurn === room.humanSeatIndex) {
        const legalActions = getLegalActions(room.state, room.humanSeatIndex);
        const action =
          legalActions.find((candidate) => candidate.type === "discard") ??
          legalActions.find((candidate) => candidate.type === "pass");

        if (!action) {
          break;
        }

        const result = service.applyHumanAction(player, action);
        expect(result?.error).toBeUndefined();
      } else {
        service.applyNextBotAction(room);
      }
    }

    expect(service.getPlayerView(room).eventMessages.length).toBeLessThanOrEqual(20);
  });

  it("persists quick room records, events, and final results", async () => {
    const gameRecordRepository = createMemoryGameRecordRepository();
    const service = createGameRoomService({ gameRecordRepository });
    const room = service.getOrCreateQuickRoom(player);

    await service.waitForPersistentWrites(room.id);

    expect(gameRecordRepository.getRecord(room.id)).toMatchObject({
      events: [
        expect.objectContaining({
          text: "player-a 加入快速对局",
          viewSnapshot: expect.objectContaining({
            availableActions: expect.any(Array),
            roomId: room.id,
            username: "player-a"
          })
        })
      ],
      humanSeatIndex: 0,
      playerUserId: player.id,
      roomId: room.id,
      ruleName: "simple",
      status: "playing"
    });

    room.state.currentTurn = 0;
    room.state.players[0].handTiles = handFromCodes([
      "m2",
      "m3",
      "m4",
      "m3",
      "m4",
      "m5",
      "p4",
      "p5",
      "p6",
      "s6",
      "s7",
      "s8",
      "p8",
      "p8"
    ]);
    const lastDrawnTileId = room.state.players[0].handTiles.at(-1)?.id;
    if (!lastDrawnTileId) {
      throw new Error("Expected winning hand to have a last tile");
    }
    room.state.players[0].lastDrawnTileId = lastDrawnTileId;

    const result = service.applyHumanAction(player, { type: "hu" });
    expect(result?.error).toBeUndefined();

    await service.waitForPersistentWrites(room.id);

    expect(gameRecordRepository.getRecord(room.id)).toMatchObject({
      endReason: "hu",
      events: expect.arrayContaining([
        expect.objectContaining({ text: "player-a 加入快速对局" }),
        expect.objectContaining({
          text: "player-a 胡",
          viewSnapshot: expect.objectContaining({ phase: "ended" })
        }),
        expect.objectContaining({
          text: expect.stringContaining("player-a 自摸"),
          viewSnapshot: expect.objectContaining({
            result: expect.objectContaining({ winType: "selfDraw" })
          })
        })
      ]),
      status: "ended",
      totalPoints: 40,
      winnerSeatIndex: 0,
      winType: "selfDraw"
    });

    await expect(gameRecordRepository.getRecordForPlayer(player.id, room.id)).resolves.toMatchObject({
      result: {
        fanTotal: 2,
        fans: expect.arrayContaining([expect.objectContaining({ name: "断幺九" })]),
        totalPoints: 40,
        winnerSeatIndex: 0,
        winningTile: expect.objectContaining({ label: "8筒" }),
        winType: "selfDraw"
      },
      events: expect.arrayContaining([
        expect.objectContaining({
          viewSnapshot: expect.objectContaining({
            eventMessages: expect.arrayContaining([
              expect.objectContaining({ text: "player-a 加入快速对局" })
            ])
          })
        })
      ])
    });
  });
});

function handFromCodes(codes: TileCode[]) {
  const copyCounters = new Map<TileCode, number>();

  return codes.map((code) => {
    const copyIndex = copyCounters.get(code) ?? 0;
    copyCounters.set(code, copyIndex + 1);
    return createTile(code, copyIndex);
  });
}
