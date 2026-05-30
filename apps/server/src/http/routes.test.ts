import type { UserSummary } from "@mahjong/shared";
import { describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { hashPassword } from "../modules/auth/password.js";
import type {
  CreateUserInput,
  StoredUser,
  UserRepository
} from "../modules/users/userRepository.js";

class MemoryUserRepository implements UserRepository {
  private nextId = 1;
  private readonly users = new Map<number, StoredUser>();

  async create(input: CreateUserInput): Promise<StoredUser> {
    const now = new Date().toISOString();
    const user: StoredUser = {
      id: this.nextId,
      username: input.username,
      passwordHash: input.passwordHash,
      role: input.role,
      createdAt: now,
      updatedAt: now
    };

    this.nextId += 1;
    this.users.set(user.id, user);
    return user;
  }

  async deletePlayer(id: number): Promise<boolean> {
    const user = this.users.get(id);
    if (!user || user.role !== "player") {
      return false;
    }

    return this.users.delete(id);
  }

  async findById(id: number): Promise<StoredUser | null> {
    return this.users.get(id) ?? null;
  }

  async findByUsername(username: string): Promise<StoredUser | null> {
    for (const user of this.users.values()) {
      if (user.username === username) {
        return user;
      }
    }

    return null;
  }

  async listPlayers(): Promise<UserSummary[]> {
    return [...this.users.values()]
      .filter((user) => user.role === "player")
      .map((user) => ({
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }));
  }
}

async function createTestApp() {
  const userRepository = new MemoryUserRepository();
  await userRepository.create({
    username: "admin",
    passwordHash: await hashPassword("admin123"),
    role: "admin"
  });
  await userRepository.create({
    username: "player1",
    passwordHash: await hashPassword("player123"),
    role: "player"
  });

  const app = await createApp({
    authTokenSecret: "test-secret",
    userRepository
  });

  return { app, userRepository };
}

describe("routes", () => {
  it("returns health status", async () => {
    const { app } = await createTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });

    await app.close();
  });

  it("logs in and returns the current user", async () => {
    const { app } = await createTestApp();

    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        username: "admin",
        password: "admin123"
      }
    });

    expect(loginResponse.statusCode).toBe(200);
    const loginBody = loginResponse.json<{
      token: string;
      user: { role: string; username: string };
    }>();
    expect(loginBody.user).toMatchObject({
      username: "admin",
      role: "admin"
    });

    const meResponse = await app.inject({
      headers: {
        authorization: `Bearer ${loginBody.token}`
      },
      method: "GET",
      url: "/auth/me"
    });

    expect(meResponse.statusCode).toBe(200);
    expect(meResponse.json()).toMatchObject({
      user: {
        username: "admin",
        role: "admin"
      }
    });

    await app.close();
  });

  it("acknowledges stateless logout", async () => {
    const { app } = await createTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/auth/logout"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });

    await app.close();
  });

  it("rejects invalid login and unauthenticated admin requests", async () => {
    const { app } = await createTestApp();

    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        username: "admin",
        password: "wrong-password"
      }
    });
    expect(loginResponse.statusCode).toBe(401);

    const playersResponse = await app.inject({
      method: "GET",
      url: "/admin/players"
    });
    expect(playersResponse.statusCode).toBe(401);

    await app.close();
  });

  it("allows admins to create, list, and delete player accounts", async () => {
    const { app } = await createTestApp();
    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        username: "admin",
        password: "admin123"
      }
    });
    const token = loginResponse.json<{ token: string }>().token;

    const createResponse = await app.inject({
      headers: {
        authorization: `Bearer ${token}`
      },
      method: "POST",
      url: "/admin/players",
      payload: {
        username: "new_player",
        password: "player123"
      }
    });

    expect(createResponse.statusCode).toBe(201);
    const createdPlayer = createResponse.json<{ player: UserSummary }>().player;

    const listResponse = await app.inject({
      headers: {
        authorization: `Bearer ${token}`
      },
      method: "GET",
      url: "/admin/players"
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json<{ players: UserSummary[] }>().players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ username: "new_player" })
      ])
    );

    const deleteResponse = await app.inject({
      headers: {
        authorization: `Bearer ${token}`
      },
      method: "DELETE",
      url: `/admin/players/${createdPlayer.id}`
    });
    expect(deleteResponse.statusCode).toBe(204);

    await app.close();
  });

  it("rejects duplicate and invalid player creation requests", async () => {
    const { app } = await createTestApp();
    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        username: "admin",
        password: "admin123"
      }
    });
    const token = loginResponse.json<{ token: string }>().token;

    const duplicateResponse = await app.inject({
      headers: {
        authorization: `Bearer ${token}`
      },
      method: "POST",
      url: "/admin/players",
      payload: {
        username: "player1",
        password: "player123"
      }
    });
    expect(duplicateResponse.statusCode).toBe(409);

    const invalidResponse = await app.inject({
      headers: {
        authorization: `Bearer ${token}`
      },
      method: "POST",
      url: "/admin/players",
      payload: {
        username: "x",
        password: "123"
      }
    });
    expect(invalidResponse.statusCode).toBe(400);

    await app.close();
  });

  it("forbids players from using admin account management routes", async () => {
    const { app } = await createTestApp();
    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        username: "player1",
        password: "player123"
      }
    });
    const token = loginResponse.json<{ token: string }>().token;

    const playersResponse = await app.inject({
      headers: {
        authorization: `Bearer ${token}`
      },
      method: "GET",
      url: "/admin/players"
    });

    expect(playersResponse.statusCode).toBe(403);

    await app.close();
  });
});
