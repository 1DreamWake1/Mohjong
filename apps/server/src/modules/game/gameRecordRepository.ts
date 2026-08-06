import type {
  GameHistoryEvent,
  GameHistoryDetail,
  GameHistoryItem,
  AdminGameHistoryDetail,
  AdminGameHistoryItem,
  GameHistoryResultSnapshot,
  GameReadyResult,
  GameWinnerResult,
  GameRecordEndReason,
  GameRecordStatus,
  PlayerView,
  TileInfo,
  WinType
} from "@mahjong/shared";
import type { PrismaClient } from "@prisma/client";
import {
  getRuleConfigValidationErrors,
  getWaitingTileScores,
  normalizeRuleConfig,
  type MahjongGameState,
  type RuleConfig
} from "mahjong-core";

import { prisma as defaultPrisma } from "../../db/prisma.js";

export type CreateGameRecordInput = {
  humanSeatIndex: number;
  playerUserId: number;
  result?: GameHistoryResultSnapshot;
  roomId: string;
  ruleName: string;
  ruleVersion: number;
};

export type FinishGameRecordInput = {
  state: MahjongGameState;
  roomId: string;
};

export type GameRecoverySnapshot = {
  events: GameHistoryEvent[];
  humanSeatIndex: number;
  humanSeats: Array<{ seatIndex: number; userId: number }>;
  lobbyRoomId?: string;
  playerUserId: number;
  roomId: string;
  state: MahjongGameState;
  version: 1;
};

export type GameRecordSnapshot = {
  endedAt?: string;
  endReason?: GameRecordEndReason;
  events: GameHistoryEvent[];
  fanTotal?: number;
  humanSeatIndex: number;
  playerUserId: number;
  result?: GameHistoryResultSnapshot;
  recoverySnapshot?: GameRecoverySnapshot;
  roomId: string;
  ruleName: string;
  ruleVersion: number;
  startedAt: string;
  status: "playing" | "ended";
  totalPoints?: number;
  winnerSeatIndex?: number;
  winningTile?: string;
  winType?: WinType;
};

export type GameRecordRepository = {
  appendEvent(roomId: string, event: GameHistoryEvent): Promise<void>;
  createRecord(input: CreateGameRecordInput): Promise<void>;
  finishRecord(input: FinishGameRecordInput): Promise<void>;
  getRecordForAdmin(roomId: string): Promise<AdminGameHistoryDetail | null>;
  getRecordForPlayer(playerUserId: number, roomId: string): Promise<GameHistoryDetail | null>;
  listRecordsForAdmin(): Promise<AdminGameHistoryItem[]>;
  listRecordsForPlayer(playerUserId: number): Promise<GameHistoryItem[]>;
  listActiveRecoverySnapshots(): Promise<{
    invalidRoomIds: string[];
    snapshots: GameRecoverySnapshot[];
  }>;
  markRecordsAbnormal(roomIds: string[], message: string): Promise<void>;
  saveRecoverySnapshot(roomId: string, snapshot: GameRecoverySnapshot): Promise<void>;
};

export function createNoopGameRecordRepository(): GameRecordRepository {
  return {
    async appendEvent() {},
    async createRecord() {},
    async finishRecord() {},
    async getRecordForAdmin() {
      return null;
    },
    async getRecordForPlayer() {
      return null;
    },
    async listRecordsForPlayer() {
      return [];
    },
    async listRecordsForAdmin() {
      return [];
    },
    async listActiveRecoverySnapshots() {
      return { invalidRoomIds: [], snapshots: [] };
    },
    async markRecordsAbnormal() {
      // No persistence is configured for this repository.
    },
    async saveRecoverySnapshot() {
      // No persistence is configured for this repository.
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
        ruleVersion: input.ruleVersion,
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

    async getRecordForAdmin(roomId) {
      const record = records.get(roomId);
      if (!record) {
        return null;
      }

      return {
        ...toHistoryItem(record),
        events: [...record.events],
        playerUserId: record.playerUserId,
        ...(record.result ? { result: record.result } : {})
      };
    },

    async listRecordsForPlayer(playerUserId) {
      return [...records.values()]
        .filter((record) => record.playerUserId === playerUserId)
        .sort((leftRecord, rightRecord) =>
          rightRecord.startedAt.localeCompare(leftRecord.startedAt)
        )
        .map(toHistoryItem);
    },

    async listRecordsForAdmin() {
      return [...records.values()]
        .sort((leftRecord, rightRecord) =>
          rightRecord.startedAt.localeCompare(leftRecord.startedAt)
        )
        .map((record) => ({ ...toHistoryItem(record), playerUserId: record.playerUserId }));
    },

    async listActiveRecoverySnapshots() {
      const activeRecords = [...records.values()].filter((record) => record.status === "playing");
      return {
        invalidRoomIds: activeRecords
          .filter((record) => !record.recoverySnapshot)
          .map((record) => record.roomId),
        snapshots: activeRecords.flatMap((record) =>
          record.recoverySnapshot ? [structuredClone(record.recoverySnapshot)] : []
        )
      };
    },

    async markRecordsAbnormal(roomIds, message) {
      for (const roomId of roomIds) {
        const record = records.get(roomId);
        if (!record || record.status !== "playing") {
          continue;
        }

        record.status = "ended";
        record.endReason = "abnormal";
        record.endedAt = new Date().toISOString();
        record.events.push({
          createdAt: record.endedAt,
          id: `abnormal-${roomId}`,
          text: message
        });
      }
    },

    async saveRecoverySnapshot(roomId, snapshot) {
      const record = records.get(roomId);
      if (!record) {
        return;
      }

      record.recoverySnapshot = structuredClone(snapshot);
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
          ...(event.viewSnapshot ? { stateSnapshot: JSON.stringify(event.viewSnapshot) } : {}),
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
          ruleVersion: input.ruleVersion,
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
          },
          player: { select: { username: true } }
        },
        where: {
          playerUserId,
          roomId
        }
      });

      if (!record) {
        return null;
      }

      return toHistoryDetailFromPrisma(record);
    },

    async getRecordForAdmin(roomId) {
      const record = await client.gameRecord.findFirst({
        include: {
          events: {
            orderBy: { createdAt: "asc" }
          }
        },
        where: { roomId }
      });

      return record ? toAdminHistoryDetailFromPrisma(record) : null;
    },

    async listRecordsForPlayer(playerUserId) {
      const records = await client.gameRecord.findMany({
        orderBy: { startedAt: "desc" },
        where: { playerUserId }
      });

      return records.map(toHistoryItemFromPrisma);
    },

    async listRecordsForAdmin() {
      const records = await client.gameRecord.findMany({
        include: { player: { select: { username: true } } },
        orderBy: { startedAt: "desc" }
      });

      return records.map(toAdminHistoryItemFromPrisma);
    },

    async listActiveRecoverySnapshots() {
      const records = await client.gameRecord.findMany({
        select: { recoverySnapshot: true, roomId: true },
        where: {
          status: "playing"
        }
      });

      const invalidRoomIds: string[] = [];
      const snapshots = records.flatMap((record) => {
        const snapshot = parseGameRecoverySnapshot(record.recoverySnapshot);
        if (!snapshot) {
          invalidRoomIds.push(record.roomId);
          return [];
        }
        return [snapshot];
      });
      return { invalidRoomIds, snapshots };
    },

    async markRecordsAbnormal(roomIds, message) {
      if (roomIds.length === 0) {
        return;
      }

      const records = await client.gameRecord.findMany({
        select: { id: true },
        where: { roomId: { in: roomIds }, status: "playing" }
      });
      const endedAt = new Date();
      if (records.length === 0) {
        return;
      }
      await client.$transaction([
        client.gameRecord.updateMany({
          data: { endedAt, endReason: "abnormal", status: "ended" },
          where: { roomId: { in: roomIds }, status: "playing" }
        }),
        client.gameEvent.createMany({
          data: records.map((record) => ({
            createdAt: endedAt,
            message,
            recordId: record.id
          }))
        })
      ]);
    },

    async saveRecoverySnapshot(roomId, snapshot) {
      await client.gameRecord.updateMany({
        data: {
          recoverySnapshot: JSON.stringify(snapshot)
        },
        where: { roomId }
      });
    }
  };
}

export function parseGameRecoverySnapshot(value: string | null): GameRecoverySnapshot | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const snapshot: unknown = JSON.parse(value);
    if (
      !isRecord(snapshot) ||
      snapshot.version !== 1 ||
      typeof snapshot.roomId !== "string" ||
      typeof snapshot.playerUserId !== "number" ||
      typeof snapshot.humanSeatIndex !== "number" ||
      !Array.isArray(snapshot.events) ||
      !Array.isArray(snapshot.humanSeats) ||
      !isRecord(snapshot.state) ||
      snapshot.state.phase !== "playing" ||
      !Array.isArray(snapshot.state.players) ||
      snapshot.state.players.length !== 4 ||
      !Array.isArray(snapshot.state.wall) ||
      !isRecord(snapshot.state.rules)
    ) {
      return undefined;
    }

    const humanSeatsAreValid = snapshot.humanSeats.every(
      (seat) =>
        isRecord(seat) &&
        Number.isInteger(seat.userId) &&
        Number.isInteger(seat.seatIndex) &&
        Number(seat.seatIndex) >= 0 &&
        Number(seat.seatIndex) < 4
    );
    if (!humanSeatsAreValid) {
      return undefined;
    }

    const recoverySnapshot = snapshot as GameRecoverySnapshot;
    recoverySnapshot.state.rules = normalizeRuleConfig(snapshot.state.rules as RuleConfig);
    if (getRuleConfigValidationErrors(recoverySnapshot.state.rules).length > 0) {
      return undefined;
    }
    return recoverySnapshot;
  } catch {
    return undefined;
  }
}

function createResultSnapshot(state: MahjongGameState): GameHistoryResultSnapshot {
  const readyResults: GameReadyResult[] = state.players.flatMap((player) => {
    const waitingScores = getWaitingTileScores(state, player.seatIndex);
    return waitingScores.length > 0
      ? [
          {
            maxFanTotal: Math.max(...waitingScores.map((result) => result.fanTotal)),
            maxPoints: Math.max(...waitingScores.map((result) => result.totalPoints)),
            seatIndex: player.seatIndex,
            waitingTiles: waitingScores.map((result) => result.tile)
          }
        ]
      : [];
  });

  return {
    fanTotal: state.score?.fanTotal ?? 0,
    fans: state.score?.fans.map((fan) => ({ name: fan.name, value: fan.value })) ?? [],
    totalPoints: state.score?.totalPoints ?? 0,
    ...(state.gangScores
      ? { gangScores: [...state.gangScores] as [number, number, number, number] }
      : {}),
    ...(readyResults.length > 0 ? { readyResults } : {}),
    ...(state.endReason ? { endReason: state.endReason } : {}),
    ...(state.winnerSeatIndex === undefined ? {} : { winnerSeatIndex: state.winnerSeatIndex }),
    ...(state.winningTile ? { winningTile: state.winningTile } : {}),
    ...(state.winType ? { winType: state.winType } : {}),
    ...(state.winRecords && state.winRecords.length > 0
      ? {
          winnerResults: state.winRecords.map((record) => ({
            endReason: "hu" as const,
            fans: record.score.fans.map((fan) => ({ name: fan.name, value: fan.value })),
            fanTotal: record.score.fanTotal,
            totalPoints: record.score.totalPoints,
            winType: record.winType,
            ...(record.winContext ? { winContext: record.winContext } : {}),
            winnerSeatIndex: record.winnerSeatIndex,
            ...(record.winningTile ? { winningTile: record.winningTile } : {})
          }))
        }
      : {})
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
          if (!isRecord(fan) || typeof fan.name !== "string" || typeof fan.value !== "number") {
            return [];
          }

          return [{ name: fan.name, value: fan.value }];
        })
      : [];
    const endReason = toResultEndReason(readString(parsedValue.endReason));
    const winType = toWinType(readString(parsedValue.winType));
    const winnerSeatIndex =
      typeof parsedValue.winnerSeatIndex === "number" ? parsedValue.winnerSeatIndex : undefined;
    const winningTile = isTileInfo(parsedValue.winningTile) ? parsedValue.winningTile : undefined;
    const winnerResults = parseWinnerResults(parsedValue.winnerResults);
    const gangScores = parseGangScores(parsedValue.gangScores);
    const readyResults = parseReadyResults(parsedValue.readyResults);

    return {
      fanTotal,
      fans,
      totalPoints,
      ...(endReason ? { endReason } : {}),
      ...(winnerSeatIndex === undefined ? {} : { winnerSeatIndex }),
      ...(winningTile ? { winningTile } : {}),
      ...(winType ? { winType } : {}),
      ...(gangScores ? { gangScores } : {}),
      ...(readyResults.length > 0 ? { readyResults } : {}),
      ...(winnerResults.length > 0 ? { winnerResults } : {})
    };
  } catch {
    return undefined;
  }
}

function parseReadyResults(value: unknown): GameReadyResult[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): GameReadyResult[] => {
    if (!isRecord(entry) || !isSeatIndex(entry.seatIndex) || !Array.isArray(entry.waitingTiles)) {
      return [];
    }
    const waitingTiles = entry.waitingTiles.filter(isTileInfo);
    return waitingTiles.length > 0 &&
      typeof entry.maxFanTotal === "number" &&
      Number.isFinite(entry.maxFanTotal) &&
      typeof entry.maxPoints === "number" &&
      Number.isFinite(entry.maxPoints)
      ? [
          {
            maxFanTotal: entry.maxFanTotal,
            maxPoints: entry.maxPoints,
            seatIndex: entry.seatIndex,
            waitingTiles
          }
        ]
      : [];
  });
}

function parseGangScores(value: unknown): [number, number, number, number] | undefined {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every((score) => typeof score === "number" && Number.isFinite(score))
  ) {
    return undefined;
  }

  return [value[0] as number, value[1] as number, value[2] as number, value[3] as number];
}

function parseWinnerResults(value: unknown): GameWinnerResult[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): GameWinnerResult[] => {
    if (!isRecord(entry) || !isSeatIndex(entry.winnerSeatIndex)) return [];
    const fans = Array.isArray(entry.fans)
      ? entry.fans.flatMap((fan) =>
          isRecord(fan) && typeof fan.name === "string" && typeof fan.value === "number"
            ? [{ name: fan.name, value: fan.value }]
            : []
        )
      : [];
    const winType = toWinType(readString(entry.winType));
    const winContext = toWinContext(readString(entry.winContext));
    return [
      {
        endReason: "hu",
        fanTotal: typeof entry.fanTotal === "number" ? entry.fanTotal : 0,
        fans,
        totalPoints: typeof entry.totalPoints === "number" ? entry.totalPoints : 0,
        winnerSeatIndex: entry.winnerSeatIndex,
        ...(winType ? { winType } : {}),
        ...(winContext ? { winContext } : {}),
        ...(isTileInfo(entry.winningTile) ? { winningTile: entry.winningTile } : {})
      }
    ];
  });
}

function parsePlayerViewSnapshot(value: string | null): PlayerView | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsedValue: unknown = JSON.parse(value);
    return isPlayerView(parsedValue) ? parsedValue : undefined;
  } catch {
    return undefined;
  }
}

function toHistoryItem(record: GameRecordSnapshot): GameHistoryItem {
  return {
    roomId: record.roomId,
    ruleName: record.ruleName,
    ruleVersion: record.ruleVersion,
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

type PrismaGameRecordWithEvents = Awaited<ReturnType<PrismaClient["gameRecord"]["findFirst"]>> & {
  events?: {
    createdAt: Date;
    id: number;
    message: string;
    stateSnapshot: string | null;
  }[];
};

type PrismaAdminGameRecord = PrismaGameRecordWithEvents & {
  player?: { username: string } | null;
};

function toGameRecordStatus(value: string): GameRecordStatus {
  return value === "ended" ? "ended" : "playing";
}

function toEndReason(value: string | null): GameRecordEndReason | undefined {
  return value === "hu" || value === "draw" || value === "abnormal" ? value : undefined;
}

function toResultEndReason(value: string | null): "hu" | "draw" | undefined {
  return value === "hu" || value === "draw" ? value : undefined;
}

function toWinType(value: string | null): WinType | undefined {
  return value === "selfDraw" || value === "discard" ? value : undefined;
}

function toWinContext(value: string | null): "gangDraw" | "gangDiscard" | "robGang" | undefined {
  return value === "gangDraw" || value === "gangDiscard" || value === "robGang" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isSeatIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 4;
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

function isGameEventMessage(value: unknown): value is GameHistoryEvent {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.text === "string" &&
    typeof value.createdAt === "string"
  );
}

function isDiscardPile(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.seatIndex === "number" &&
    Array.isArray(value.tiles) &&
    value.tiles.every(isTileInfo)
  );
}

function isMeldInfo(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.type === "chi" || value.type === "peng" || value.type === "gang") &&
    typeof value.ownerSeatIndex === "number" &&
    (value.fromSeatIndex === undefined || typeof value.fromSeatIndex === "number") &&
    Array.isArray(value.tiles) &&
    value.tiles.every(isTileInfo)
  );
}

function isOtherPlayerView(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.seatIndex === "number" &&
    typeof value.username === "string" &&
    typeof value.handTileCount === "number" &&
    typeof value.isBot === "boolean"
  );
}

function isAction(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.type === "discard" ||
      value.type === "chi" ||
      value.type === "peng" ||
      value.type === "gang" ||
      value.type === "hu" ||
      value.type === "pass") &&
    (value.tileId === undefined || typeof value.tileId === "string") &&
    (value.tileIds === undefined ||
      (Array.isArray(value.tileIds) && value.tileIds.every((tileId) => typeof tileId === "string")))
  );
}

function isPlayerView(value: unknown): value is PlayerView {
  return (
    isRecord(value) &&
    typeof value.roomId === "string" &&
    typeof value.seatIndex === "number" &&
    typeof value.username === "string" &&
    typeof value.currentTurn === "number" &&
    (value.phase === "waiting" ||
      value.phase === "dealing" ||
      value.phase === "playing" ||
      value.phase === "ended") &&
    typeof value.wallTileCount === "number" &&
    Array.isArray(value.handTiles) &&
    value.handTiles.every(isTileInfo) &&
    Array.isArray(value.otherPlayers) &&
    value.otherPlayers.every(isOtherPlayerView) &&
    Array.isArray(value.discardAreas) &&
    value.discardAreas.every(isDiscardPile) &&
    Array.isArray(value.publicMelds) &&
    value.publicMelds.every(isMeldInfo) &&
    Array.isArray(value.availableActions) &&
    value.availableActions.every(isAction) &&
    Array.isArray(value.eventMessages) &&
    value.eventMessages.every(isGameEventMessage)
  );
}

function toHistoryItemFromPrisma(record: NonNullable<PrismaGameRecordWithEvents>): GameHistoryItem {
  const endReason = toEndReason(record.endReason);
  const winType = toWinType(record.winType);

  return {
    roomId: record.roomId,
    ruleName: record.ruleName,
    ruleVersion: record.ruleVersion,
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

function toHistoryDetailFromPrisma(
  record: NonNullable<PrismaGameRecordWithEvents>
): GameHistoryDetail {
  const result = parseResultSnapshot(record.resultSnapshot);

  return {
    ...toHistoryItemFromPrisma(record),
    events: (record.events ?? []).map((event) => {
      const viewSnapshot = parsePlayerViewSnapshot(event.stateSnapshot);

      return {
        createdAt: event.createdAt.toISOString(),
        id: `event-${event.id}`,
        text: event.message,
        ...(viewSnapshot ? { viewSnapshot } : {})
      };
    }),
    ...(result ? { result } : {})
  };
}

function toAdminHistoryItemFromPrisma(
  record: NonNullable<PrismaAdminGameRecord>
): AdminGameHistoryItem {
  return {
    ...toHistoryItemFromPrisma(record),
    ...(record.playerUserId === null ? {} : { playerUserId: record.playerUserId }),
    ...(record.player ? { playerUsername: record.player.username } : {})
  };
}

function toAdminHistoryDetailFromPrisma(
  record: NonNullable<PrismaAdminGameRecord>
): AdminGameHistoryDetail {
  return {
    ...toHistoryDetailFromPrisma(record),
    ...(record.playerUserId === null ? {} : { playerUserId: record.playerUserId }),
    ...(record.player ? { playerUsername: record.player.username } : {})
  };
}
