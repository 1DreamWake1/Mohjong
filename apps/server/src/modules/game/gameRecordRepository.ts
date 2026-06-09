import type { GameEventMessage } from "@mahjong/shared";
import type { PrismaClient } from "@prisma/client";
import type { MahjongGameState } from "mahjong-core";

import { prisma as defaultPrisma } from "../../db/prisma.js";

export type CreateGameRecordInput = {
  humanSeatIndex: number;
  playerUserId: number;
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
  roomId: string;
  ruleName: string;
  status: "playing" | "ended";
  totalPoints?: number;
  winnerSeatIndex?: number;
  winningTile?: string;
  winType?: "selfDraw" | "discard";
};

export type GameRecordRepository = {
  appendEvent(roomId: string, event: GameEventMessage): Promise<void>;
  createRecord(input: CreateGameRecordInput): Promise<void>;
  finishRecord(input: FinishGameRecordInput): Promise<void>;
};

export function createNoopGameRecordRepository(): GameRecordRepository {
  return {
    async appendEvent() {},
    async createRecord() {},
    async finishRecord() {}
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
    }
  };
}

function createResultSnapshot(state: MahjongGameState) {
  return {
    endReason: state.endReason,
    fanTotal: state.score?.fanTotal ?? 0,
    fans: state.score?.fans.map((fan) => ({ name: fan.name, value: fan.value })) ?? [],
    totalPoints: state.score?.totalPoints ?? 0,
    winnerSeatIndex: state.winnerSeatIndex,
    winningTile: state.winningTile,
    winType: state.winType
  };
}
