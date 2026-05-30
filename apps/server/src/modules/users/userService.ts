import type {
  CreatePlayerRequest,
  ResetPlayerPasswordRequest,
  UserSummary
} from "@mahjong/shared";

import { hashPassword } from "../auth/password.js";
import type { UserRepository } from "./userRepository.js";

export type CreatePlayerResult =
  | { ok: true; player: UserSummary }
  | { ok: false; reason: "duplicate_username" | "invalid_input" };

function normalizeUsername(username: string): string {
  return username.trim();
}

function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_-]{3,32}$/.test(username);
}

function isValidPassword(password: string): boolean {
  return password.length >= 6 && password.length <= 128;
}

export function createUserService(userRepository: UserRepository) {
  return {
    async createPlayer(input: CreatePlayerRequest): Promise<CreatePlayerResult> {
      const username = normalizeUsername(input.username);
      if (!isValidUsername(username) || !isValidPassword(input.password)) {
        return { ok: false, reason: "invalid_input" };
      }

      const existing = await userRepository.findByUsername(username);
      if (existing) {
        return { ok: false, reason: "duplicate_username" };
      }

      const player = await userRepository.create({
        username,
        passwordHash: await hashPassword(input.password),
        role: "player"
      });

      return { ok: true, player };
    },

    async deletePlayer(id: number): Promise<boolean> {
      return userRepository.deletePlayer(id);
    },

    async listPlayers(): Promise<UserSummary[]> {
      return userRepository.listPlayers();
    },

    async resetPlayerPassword(
      id: number,
      input: ResetPlayerPasswordRequest
    ): Promise<"ok" | "invalid_input" | "not_found"> {
      if (!isValidPassword(input.password)) {
        return "invalid_input";
      }

      const updated = await userRepository.updatePlayerPassword(
        id,
        await hashPassword(input.password)
      );

      return updated ? "ok" : "not_found";
    }
  };
}
