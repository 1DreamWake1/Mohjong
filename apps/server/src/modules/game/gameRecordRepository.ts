import type {
  GameEventMessage,
  GameHistoryDetail,
  GameHistoryItem,
  GameHistoryResultSnapshot,
  GameRecordStatus,
  TileInfo,
  WinType
} from "@mahjong/shared";
import type { PrismaClient } from "@prisma/client";
import type { MahjongGameState } from "mahjong-core";

import { prisma as defaultPrisma } from "../../db/prisma.js";

export type CreateGameRecordInput = {
  humanSeatIndex: number;
  playerUserId: number;
  result?: GameHistoryResultSnapshot;
  roomId: string;
  ruleName: string;
};

export type FinishGameRecordInput = {
  state: MahjongGameState;
  roomId: string;
};

export type GameRecordSnapshot = {
  endedAt?: string;
  endReason?: "hu" | "draw";
  events: GameEventMessage[];
  fanTotal?: number;
  humanSeatIndex: number;
  playerUserId: number;
  result?: GameHistoryResultSnapshot;
  roomId: string;
  ruleName: string;
  startedAt: string;
  status: "playing" | "ended";
  totalPoints?: number;
  winnerSeatIndex?: number;
  winningTile?: string;
  winType?: WinType;
};

export type GameRecordRepository = {
  appendEvent(roomId: string, event: GameEventMessage): Promise<void>;
  createRecord(input: CreateGameRecordInput): Promise<void>;
  finishRecord(input: FinishGameRecordInput): Promise<void>;
  getRecordForPlayer(playerUserId: number, roomId: string): Promise<GameHistoryDetail | null>;
  listRecordsForPlayer(playerUserId: number): Promise<GameHistoryItem[]>;
};

export function createNoopGameRecordRepository(): GameRecordRepository {
  return {
    async appendEvent() {},
    async createRecord() {},
    async finishRecord() {},
    async getRecordForPlayer() {
      return null;
    },
    async listRecordsForPlayer() {
      return [];
    }
  };
}

export function createMemoryGameRecordRepository(): GameRecordRepository & {
  getRecord(roomId: string): GameRecordSnapshot | undefined;
  listRecords(): GameRecordSnapshot[];
} {
  const records = new Map<string, GameRecordSnapshot>();

  return {
    async appendEvent(roomId, event) {
      const record = records.get(roomId);
      if (!record) {
        return;
      }

      record.events.push(event);
    },

    async createRecord(input) {
      records.set(input.roomId, {
        events: [],
        humanSeatIndex: input.humanSeatIndex,
        playerUserId: input.playerUserId,
        roomId: input.roomId,
        ruleName: input.ruleName,
        startedAt: new Date().toISOString(),
        status: "playing"
      });
    },

    async finishRecord(input) {
      const record = records.get(input.roomId);
      if (!record) {
        return;
      }

      records.set(input.roomId, {
        ...record,
        endedAt: new Date().toISOString(),
        ...(input.state.endReason ? { endReason: input.state.endReason } : {}),
        result: createResultSnapshot(input.state),
        status: "ended",
        ...(input.state.score ? { fanTotal: input.state.score.fanTotal } : {}),
        ...(input.state.score ? { totalPoints: input.state.score.totalPoints } : {}),
        ...(input.state.winnerSeatIndex === undefined
          ? {}
          : { winnerSeatIndex: input.state.winnerSeatIndex }),
        ...(input.state.winningTile ? { winningTile: input.state.winningTile.label } : {}),
        ...(input.state.winType ? { winType: input.state.winType } : {})
      });
    },

    getRecord(roomId) {
      const record = records.get(roomId);
      return record
        ? {
            ...record,
            events: [...record.events]
          }
        : undefined;
    },

    listRecords() {
      return [...records.values()].map((record) => ({
        ...record,
        events: [...record.events]
      }));
    },

    async getRecordForPlayer(playerUserId, roomId) {
      const record = records.get(roomId);
      if (!record || record.playerUserId !== playerUserId) {
        return null;
      }

      return {
        ...toHistoryItem(record),
        events: [...record.events],
        ...(record.result ? { result: record.result } : {})
      };
    },

    async listRecordsForPlayer(playerUserId) {
      return [...records.values()]
        .filter((record) => record.playerUserId === playerUserId)
        .sort((leftRecord, rightRecord) => rightRecord.startedAt.localeCompare(leftRecord.startedAt))
        .map(toHistoryItem);
    }
  };
}

export function createPrismaGameRecordRepository(
  client: PrismaClient = defaultPrisma
): GameRecordRepository {
  return {
    async appendEvent(roomId, event) {
      const record = await client.gameRecord.findUnique({
        select: { id: true },
        where: { roomId }
      });

      if (!record) {
        return;
      }

      await client.gameEvent.create({
        data: {
          createdAt: event.createdAt,
          message: event.text,
          recordId: record.id
        }
      });
    },

    async createRecord(input) {
      await client.gameRecord.create({
        data: {
          humanSeatIndex: input.humanSeatIndex,
          playerUserId: input.playerUserId,
          roomId: input.roomId,
          ruleName: input.ruleName,
          status: "playing"
        }
      });
    },

    async finishRecord(input) {
      await client.gameRecord.updateMany({
        data: {
          endedAt: new Date(),
          resultSnapshot: JSON.stringify(createResultSnapshot(input.state)),
          status: "ended",
          ...(input.state.endReason ? { endReason: input.state.endReason } : {}),
          ...(input.state.score ? { fanTotal: input.state.score.fanTotal } : {}),
          ...(input.state.score ? { totalPoints: input.state.score.totalPoints } : {}),
          ...(input.state.winnerSeatIndex === undefined
            ? {}
            : { winnerSeatIndex: input.state.winnerSeatIndex }),
          ...(input.state.winningTile ? { winningTile: input.state.winningTile.label } : {}),
          ...(input.state.winType ? { winType: input.state.winType } : {})
        },
        where: { roomId: input.roomId }
      });
    },

    async getRecordForPlayer(playerUserId, roomId) {
      const record = await client.gameRecord.findFirst({
        include: {
          events: {
            orderBy: { createdAt: "asc" }
          }
        },
        where: {
          playerUserId,
          roomId
        }
      });

      if (!record) {
        return null;
      }

      const result = parseResultSnapshot(record.resultSnapshot);

      return {
        ...toHistoryItemFromPrisma(record),
        events: record.events.map((event) => ({
          createdAt: event.createdAt.toISOString(),
          id: `event-${event.id}`,
          text: event.message
        })),
        ...(result ? { result } : {})
      };
    },

    async listRecordsForPlayer(playerUserId) {
      const records = await client.gameRecord.findMany({
        orderBy: { startedAt: "desc" },
        where: { playerUserId }
      });

      return records.map(toHistoryItemFromPrisma);
    }
  };
}

function createResultSnapshot(state: MahjongGameState): GameHistoryResultSnapshot {
  return {
    fanTotal: state.score?.fanTotal ?? 0,
    fans: state.score?.fans.map((fan) => ({ name: fan.name, value: fan.value })) ?? [],
    totalPoints: state.score?.totalPoints ?? 0,
    ...(state.endReason ? { endReason: state.endReason } : {}),
    ...(state.winnerSeatIndex === undefined ? {} : { winnerSeatIndex: state.winnerSeatIndex }),
    ...(state.winningTile ? { winningTile: state.winningTile } : {}),
    ...(state.winType ? { winType: state.winType } : {})
  };
}

function parseResultSnapshot(value: string | null): GameHistoryResultSnapshot | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsedValue: unknown = JSON.parse(value);
    if (!isRecord(parsedValue)) {
      return undefined;
    }

    const fanTotal = typeof parsedValue.fanTotal === "number" ? parsedValue.fanTotal : 0;
    const totalPoints = typeof parsedValue.totalPoints === "number" ? parsedValue.totalPoints : 0;
    const fans = Array.isArray(parsedValue.fans)
      ? parsedValue.fans.flatMap((fan): GameHistoryResultSnapshot["fans"] => {
          if (
            !isRecord(fan) ||
            typeof fan.name !== "string" ||
            typeof fan.value !== "number"
          ) {
            return [];
          }

          return [{ name: fan.name, value: fan.value }];
        })
      : [];
    const endReason = toEndReason(readString(parsedValue.endReason));
    const winType = toWinType(readString(parsedValue.winType));
    const winnerSeatIndex =
      typeof parsedValue.winnerSeatIndex === "number" ? parsedValue.winnerSeatIndex : undefined;
    const winningTile = isTileInfo(parsedValue.winningTile) ? parsedValue.winningTile : undefined;

    return {
      fanTotal,
      fans,
      totalPoints,
      ...(endReason ? { endReason } : {}),
      ...(winnerSeatIndex === undefined ? {} : { winnerSeatIndex }),
      ...(winningTile ? { winningTile } : {}),
      ...(winType ? { winType } : {})
    };
  } catch {
    return undefined;
  }
}

function toHistoryItem(record: GameRecordSnapshot): GameHistoryItem {
  return {
    roomId: record.roomId,
    ruleName: record.ruleName,
    startedAt: record.startedAt,
    status: record.status,
    ...(record.endedAt ? { endedAt: record.endedAt } : {}),
    ...(record.endReason ? { endReason: record.endReason } : {}),
    ...(record.winnerSeatIndex === undefined ? {} : { winnerSeatIndex: record.winnerSeatIndex }),
    ...(record.winType ? { winType: record.winType } : {}),
    ...(record.winningTile ? { winningTile: record.winningTile } : {}),
    ...(record.fanTotal === undefined ? {} : { fanTotal: record.fanTotal }),
    ...(record.totalPoints === undefined ? {} : { totalPoints: record.totalPoints })
  };
}

type PrismaGameRecordWithEvents = Awaited<
  ReturnType<PrismaClient["gameRecord"]["findFirst"]>
> & {
  events?: {
    createdAt: Date;
    id: number;
    message: string;
  }[];
};

function toGameRecordStatus(value: string): GameRecordStatus {
  return value === "ended" ? "ended" : "playing";
}

function toEndReason(value: string | null): "hu" | "draw" | undefined {
  return value === "hu" || value === "draw" ? value : undefined;
}

function toWinType(value: string | null): WinType | undefined {
  return value === "selfDraw" || value === "discard" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isTileInfo(value: unknown): value is TileInfo {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.rank === "number" &&
    (value.suit === "characters" ||
      value.suit === "dots" ||
      value.suit === "bamboo" ||
      value.suit === "winds" ||
      value.suit === "dragons")
  );
}

function toHistoryItemFromPrisma(record: NonNullable<PrismaGameRecordWithEvents>): GameHistoryItem {
  const endReason = toEndReason(record.endReason);
  const winType = toWinType(record.winType);

  return {
    roomId: record.roomId,
    ruleName: record.ruleName,
    startedAt: record.startedAt.toISOString(),
    status: toGameRecordStatus(record.status),
    ...(record.endedAt ? { endedAt: record.endedAt.toISOString() } : {}),
    ...(endReason ? { endReason } : {}),
    ...(record.winnerSeatIndex === null ? {} : { winnerSeatIndex: record.winnerSeatIndex }),
    ...(winType ? { winType } : {}),
    ...(record.winningTile ? { winningTile: record.winningTile } : {}),
    ...(record.fanTotal === null ? {} : { fanTotal: record.fanTotal }),
    ...(record.totalPoints === null ? {} : { totalPoints: record.totalPoints })
  };
}
