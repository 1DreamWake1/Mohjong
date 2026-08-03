import { PrismaClient } from "@prisma/client";

import { loadEnv } from "../config/env.js";

loadEnv();

export const prisma = new PrismaClient();

export async function checkPrismaConnection(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}

export async function closePrisma(): Promise<void> {
  await prisma.$disconnect();
}
