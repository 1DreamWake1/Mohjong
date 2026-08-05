import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../apps/server/src/modules/auth/password.js";

const e2eDatabasePath = resolve("data", "e2e.db");
const e2eDatabaseUrl = `file:${e2eDatabasePath}`;

export const E2E_ADMIN = { password: "e2e-admin-password", username: "e2e-admin" };
export const E2E_PLAYER_ONE = { password: "e2e-player-one-password", username: "e2e-player-1" };
export const E2E_PLAYER_TWO = { password: "e2e-player-two-password", username: "e2e-player-2" };
export const E2E_PLAYER_THREE = {
  password: "e2e-player-three-password",
  username: "e2e-player-3"
};

async function seedUsers(prisma: PrismaClient): Promise<void> {
  const adminPasswordHash = await hashPassword(E2E_ADMIN.password);
  const playerOnePasswordHash = await hashPassword(E2E_PLAYER_ONE.password);
  const playerTwoPasswordHash = await hashPassword(E2E_PLAYER_TWO.password);
  const playerThreePasswordHash = await hashPassword(E2E_PLAYER_THREE.password);

  await prisma.user.upsert({
    create: { passwordHash: adminPasswordHash, role: "admin", username: E2E_ADMIN.username },
    update: { passwordHash: adminPasswordHash, role: "admin" },
    where: { username: E2E_ADMIN.username }
  });
  await prisma.user.upsert({
    create: {
      passwordHash: playerOnePasswordHash,
      role: "player",
      username: E2E_PLAYER_ONE.username
    },
    update: { passwordHash: playerOnePasswordHash, role: "player" },
    where: { username: E2E_PLAYER_ONE.username }
  });
  await prisma.user.upsert({
    create: {
      passwordHash: playerTwoPasswordHash,
      role: "player",
      username: E2E_PLAYER_TWO.username
    },
    update: { passwordHash: playerTwoPasswordHash, role: "player" },
    where: { username: E2E_PLAYER_TWO.username }
  });
  await prisma.user.upsert({
    create: {
      passwordHash: playerThreePasswordHash,
      role: "player",
      username: E2E_PLAYER_THREE.username
    },
    update: { passwordHash: playerThreePasswordHash, role: "player" },
    where: { username: E2E_PLAYER_THREE.username }
  });
}

async function seedEndedRecord(prisma: PrismaClient): Promise<void> {
  const playerOne = await prisma.user.findUnique({ where: { username: E2E_PLAYER_ONE.username } });
  if (!playerOne) {
    throw new Error("E2E player one was not created");
  }

  const roomId = "e2e-ended-room";
  const existing = await prisma.gameRecord.findUnique({ where: { roomId } });
  if (existing) {
    return;
  }

  const startedAt = new Date(Date.now() - 10 * 60 * 1000);
  const endedAt = new Date(Date.now() - 5 * 60 * 1000);
  const resultSnapshot = JSON.stringify({
    endReason: "hu",
    fanTotal: 2,
    fans: [
      { name: "自摸", value: 1 },
      { name: "门前清", value: 1 }
    ],
    totalPoints: 8,
    winnerSeatIndex: 0,
    winType: "selfDraw",
    winningTile: { id: "c1-a", label: "1万", rank: 1, suit: "characters" }
  });

  await prisma.gameRecord.create({
    data: {
      endReason: "hu",
      endedAt,
      fanTotal: 2,
      humanSeatIndex: 0,
      playerUserId: playerOne.id,
      resultSnapshot,
      roomId,
      ruleName: "simple",
      ruleVersion: 1,
      startedAt,
      status: "ended",
      totalPoints: 8,
      winnerSeatIndex: 0,
      winType: "selfDraw",
      winningTile: "1万"
    }
  });
}

export default async function globalSetup(): Promise<void> {
  // 数据库删除与迁移由 playwright.config.ts 的 webServer 命令在启动 Server 前完成；
  // 这里只负责写入测试账号和演示对局数据（幂等）。
  const prisma = new PrismaClient({
    datasources: { db: { url: e2eDatabaseUrl } }
  });
  try {
    await seedUsers(prisma);
    await seedEndedRecord(prisma);
  } finally {
    await prisma.$disconnect();
  }

  console.log(`E2E database ready: ${e2eDatabasePath}`);
}
