import type { AuthUser, LoginRequest, LoginResponse } from "@mahjong/shared";

import { verifyPassword } from "./password.js";
import { createAuthToken, verifyAuthToken } from "./token.js";
import type { UserRepository } from "../users/userRepository.js";

export type AuthService = ReturnType<typeof createAuthService>;

function toAuthUser(user: AuthUser): AuthUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export function createAuthService(
  userRepository: UserRepository,
  tokenSecret: string
) {
  return {
    async getCurrentUser(token: string): Promise<AuthUser | null> {
      const payload = verifyAuthToken(token, tokenSecret);
      if (!payload) {
        return null;
      }

      const user = await userRepository.findById(payload.sub);
      return user ? toAuthUser(user) : null;
    },

    async login(input: LoginRequest): Promise<LoginResponse | null> {
      const user = await userRepository.findByUsername(input.username.trim());
      if (!user) {
        return null;
      }

      const passwordMatches = await verifyPassword(
        input.password,
        user.passwordHash
      );
      if (!passwordMatches) {
        return null;
      }

      const authUser = toAuthUser(user);
      return {
        token: createAuthToken(
          {
            sub: user.id,
            username: user.username,
            role: user.role
          },
          tokenSecret
        ),
        user: authUser
      };
    }
  };
}
