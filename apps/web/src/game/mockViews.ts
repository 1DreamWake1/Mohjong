import type { Action, GamePhase, PlayerView, TileInfo } from "@mahjong/shared";

export type GameScenarioId = "initial" | "actionable" | "ended";

export type GameScenario = {
  id: GameScenarioId;
  label: string;
  description: string;
  views: PlayerView[];
};

const playerNames = ["南山", "东风Bot", "青竹Bot", "白露Bot"];

function tile(id: string, label: string, suit: TileInfo["suit"], rank: number): TileInfo {
  return { id, label, rank, suit };
}

const hands: TileInfo[][] = [
  [
    tile("c1-a", "1万", "characters", 1),
    tile("c2-a", "2万", "characters", 2),
    tile("c3-a", "3万", "characters", 3),
    tile("d2-a", "2筒", "dots", 2),
    tile("d3-a", "3筒", "dots", 3),
    tile("d4-a", "4筒", "dots", 4),
    tile("b5-a", "5条", "bamboo", 5),
    tile("b6-a", "6条", "bamboo", 6),
    tile("b7-a", "7条", "bamboo", 7),
    tile("east-a", "东", "winds", 1),
    tile("east-b", "东", "winds", 1),
    tile("red-a", "中", "dragons", 1),
    tile("red-b", "中", "dragons", 1),
    tile("red-c", "中", "dragons", 1)
  ],
  [
    tile("c4-a", "4万", "characters", 4),
    tile("c5-a", "5万", "characters", 5),
    tile("c6-a", "6万", "characters", 6),
    tile("d7-a", "7筒", "dots", 7),
    tile("d8-a", "8筒", "dots", 8),
    tile("d9-a", "9筒", "dots", 9),
    tile("b1-a", "1条", "bamboo", 1),
    tile("b2-a", "2条", "bamboo", 2),
    tile("b3-a", "3条", "bamboo", 3),
    tile("south-a", "南", "winds", 2),
    tile("south-b", "南", "winds", 2),
    tile("white-a", "白", "dragons", 3),
    tile("white-b", "白", "dragons", 3)
  ],
  [
    tile("c7-a", "7万", "characters", 7),
    tile("c8-a", "8万", "characters", 8),
    tile("c9-a", "9万", "characters", 9),
    tile("d1-a", "1筒", "dots", 1),
    tile("d1-b", "1筒", "dots", 1),
    tile("d1-c", "1筒", "dots", 1),
    tile("b4-a", "4条", "bamboo", 4),
    tile("b5-b", "5条", "bamboo", 5),
    tile("b6-b", "6条", "bamboo", 6),
    tile("west-a", "西", "winds", 3),
    tile("west-b", "西", "winds", 3),
    tile("green-a", "发", "dragons", 2),
    tile("green-b", "发", "dragons", 2)
  ],
  [
    tile("c2-b", "2万", "characters", 2),
    tile("c3-b", "3万", "characters", 3),
    tile("c4-b", "4万", "characters", 4),
    tile("d5-a", "5筒", "dots", 5),
    tile("d6-a", "6筒", "dots", 6),
    tile("d7-b", "7筒", "dots", 7),
    tile("b7-b", "7条", "bamboo", 7),
    tile("b8-a", "8条", "bamboo", 8),
    tile("b9-a", "9条", "bamboo", 9),
    tile("north-a", "北", "winds", 4),
    tile("north-b", "北", "winds", 4),
    tile("red-d", "中", "dragons", 1),
    tile("white-c", "白", "dragons", 3)
  ]
];

const discards = [
  [tile("discard-0-1", "9条", "bamboo", 9), tile("discard-0-2", "白", "dragons", 3)],
  [tile("discard-1-1", "1万", "characters", 1), tile("discard-1-2", "东", "winds", 1)],
  [tile("discard-2-1", "8筒", "dots", 8)],
  [tile("discard-3-1", "3条", "bamboo", 3), tile("discard-3-2", "南", "winds", 2)]
];

const initialActions: Action[] = [{ type: "discard" }];
const actionableActions: Action[] = [
  { tileIds: ["c2-a", "c3-a", "discard-3-3"], type: "chi" },
  { tileId: "red-a", type: "peng" },
  { tileId: "red-a", type: "gang" },
  { type: "hu" },
  { type: "pass" }
];

function buildViews(options: {
  availableActionsForSeat: number;
  eventText: string;
  phase: GamePhase;
  roomId: string;
  wallTileCount: number;
  winnerSeatIndex?: number;
}): PlayerView[] {
  return playerNames.map((username, seatIndex) => {
    const view: PlayerView = {
      availableActions:
        seatIndex === options.availableActionsForSeat && options.phase !== "ended"
          ? options.availableActionsForSeat === 0
            ? actionableActions
            : initialActions
          : [],
      currentTurn: options.availableActionsForSeat,
      discardAreas: discards.map((tiles, discardSeatIndex) => ({
        seatIndex: discardSeatIndex,
        tiles
      })),
      eventMessages: [
        {
          createdAt: "2026-06-01T10:00:00.000Z",
          id: `${options.roomId}-event`,
          text: options.eventText
        }
      ],
      handTiles: hands[seatIndex] ?? [],
      otherPlayers: playerNames
        .map((otherUsername, otherSeatIndex) => ({
          handTileCount: hands[otherSeatIndex]?.length ?? 0,
          isBot: otherSeatIndex !== 0,
          seatIndex: otherSeatIndex,
          username: otherUsername
        }))
        .filter((player) => player.seatIndex !== seatIndex),
      phase: options.phase,
      publicMelds: [
        {
          fromSeatIndex: 3,
          ownerSeatIndex: 1,
          tiles: [
            tile("meld-1", "6筒", "dots", 6),
            tile("meld-2", "7筒", "dots", 7),
            tile("meld-3", "8筒", "dots", 8)
          ],
          type: "chi"
        }
      ],
      roomId: options.roomId,
      seatIndex,
      username,
      wallTileCount: options.wallTileCount
    };

    return options.winnerSeatIndex === undefined
      ? view
      : { ...view, winnerSeatIndex: options.winnerSeatIndex };
  });
}

export const gameScenarios: GameScenario[] = [
  {
    description: "普通摸打阶段，当前玩家可选择一张手牌打出。",
    id: "initial",
    label: "初始牌局",
    views: buildViews({
      availableActionsForSeat: 1,
      eventText: "东风Bot 摸牌后等待出牌。",
      phase: "playing",
      roomId: "demo-initial",
      wallTileCount: 68
    })
  },
  {
    description: "当前玩家面对上家弃牌，可选择吃、碰、杠、胡或过。",
    id: "actionable",
    label: "可操作",
    views: buildViews({
      availableActionsForSeat: 0,
      eventText: "白露Bot 打出中，南山可以响应。",
      phase: "playing",
      roomId: "demo-actionable",
      wallTileCount: 52
    })
  },
  {
    description: "演示牌局结束后的公开信息和胜者提示。",
    id: "ended",
    label: "已结束",
    views: buildViews({
      availableActionsForSeat: 2,
      eventText: "青竹Bot 自摸，牌局结束。",
      phase: "ended",
      roomId: "demo-ended",
      wallTileCount: 31,
      winnerSeatIndex: 2
    })
  }
];

export function getScenarioById(scenarioId: GameScenarioId): GameScenario {
  const scenario = gameScenarios.find((item) => item.id === scenarioId);
  if (scenario) {
    return scenario;
  }

  const fallback = gameScenarios[0];
  if (!fallback) {
    throw new Error("No game scenarios configured");
  }

  return fallback;
}
