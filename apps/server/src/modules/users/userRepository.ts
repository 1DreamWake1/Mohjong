import type { PrismaClient } from "@prisma/client";
import type { UserRole, UserSummary } from "@mahjong/shared";

import { prisma as defaultPrisma } from "../../db/prisma.js";

export type StoredUser = UserSummary & {
  passwordHash: string;
};

export type CreateUserInput = {
  username: string;
  passwordHash: string;
  role: UserRole;
};

export type UserRepository = {
  create(input: CreateUserInput): Promise<StoredUser>;
  deletePlayer(id: number): Promise<boolean>;
  findById(id: number): Promise<StoredUser | null>;
  findByUsername(username: string): Promise<StoredUser | null>;
  listPlayers(): Promise<UserSummary[]>;
  updatePlayerPassword(id: number, passwordHash: string): Promise<boolean>;
};

type PrismaUser = Awaited<ReturnType<PrismaClient["user"]["findUnique"]>>;

function isUserRole(role: string): role is UserRole {
  return role === "admin" || role === "player";
}

function toStoredUser(user: NonNullable<PrismaUser>): StoredUser {
  if (!isUserRole(user.role)) {
    throw new Error(`Unsupported user role: ${user.role}`);
  }

  return {
    id: user.id,
    username: user.username,
    passwordHash: user.passwordHash,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  };
}

function toUserSummary(user: StoredUser): UserSummary {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export function createPrismaUserRepository(
  client: PrismaClient = defaultPrisma
): UserRepository {
  return {
    async create(input) {
      const user = await client.user.create({
        data: input
      });

      return toStoredUser(user);
    },

    async deletePlayer(id) {
      const deleted = await client.user.deleteMany({
        where: {
          id,
          role: "player"
        }
      });

      return deleted.count > 0;
    },

    async findById(id) {
      const user = await client.user.findUnique({
        where: { id }
      });

      return user ? toStoredUser(user) : null;
    },

    async findByUsername(username) {
      const user = await client.user.findUnique({
        where: { username }
      });

      return user ? toStoredUser(user) : null;
    },

    async listPlayers() {
      const users = await client.user.findMany({
        orderBy: { username: "asc" },
        where: { role: "player" }
      });

      return users.map((user) => toUserSummary(toStoredUser(user)));
    },

    async updatePlayerPassword(id, passwordHash) {
      const updated = await client.user.updateMany({
        data: { passwordHash },
        where: {
          id,
          role: "player"
        }
      });

      return updated.count > 0;
    }
  };
}
