import type { UserSummary } from "@mahjong/shared";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import { hashPassword, verifyPassword } from "../modules/auth/password.js";
import { createMemoryGameRecordRepository } from "../modules/game/gameRecordRepository.js";
import { createGameLobbyService } from "../modules/game/gameLobbyService.js";
import { createGameRoomService } from "../modules/game/gameRoomService.js";
import { createPlayerConnectionRegistry } from "../modules/game/playerConnectionRegistry.js";
import { createPersistenceDiagnosticRegistry } from "../modules/game/persistenceDiagnosticRegistry.js";
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
      .sort((leftUser, rightUser) => leftUser.username.localeCompare(rightUser.username))
      .map((user) => ({
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }));
  }

  async updatePlayerPassword(id: number, passwordHash: string): Promise<boolean> {
    const user = this.users.get(id);
    if (!user || user.role !== "player") {
      return false;
    }

    this.users.set(id, {
      ...user,
      passwordHash,
      updatedAt: new Date().toISOString()
    });
    return true;
  }
}

async function createTestApp(options: { databaseReadinessCheck?: () => Promise<void> } = {}) {
  const userRepository = new MemoryUserRepository();
  const gameRecordRepository = createMemoryGameRecordRepository();
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
  await userRepository.create({
    username: "player2",
    passwordHash: await hashPassword("player123"),
    role: "player"
  });

  const gameRoomService = createGameRoomService({ gameRecordRepository });
  const gameLobbyService = createGameLobbyService();
  const playerConnectionRegistry = createPlayerConnectionRegistry();
  const persistenceDiagnosticRegistry = createPersistenceDiagnosticRegistry();
  const app = await createApp({
    authTokenSecret: "test-secret",
    closeDatabase: async () => undefined,
    databaseReadinessCheck: options.databaseReadinessCheck ?? (async () => undefined),
    gameLobbyService,
    gameRecordRepository,
    gameRoomService,
    playerConnectionRegistry,
    persistenceDiagnosticRegistry,
    userRepository
  });

  return {
    app,
    gameLobbyService,
    gameRecordRepository,
    gameRoomService,
    playerConnectionRegistry,
    persistenceDiagnosticRegistry,
    userRepository
  };
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

  it("reports readiness only while restoration and database access are healthy", async () => {
    const { app } = await createTestApp();
    const readyResponse = await app.inject({ method: "GET", url: "/ready" });

    expect(readyResponse.statusCode).toBe(200);
    expect(readyResponse.json()).toEqual({ status: "ready" });

    app.lifecycle.beginShutdown();
    const stoppingResponse = await app.inject({ method: "GET", url: "/ready" });
    expect(stoppingResponse.statusCode).toBe(503);
    expect(stoppingResponse.json()).toEqual({ reason: "stopping", status: "not_ready" });

    await app.close();
  });

  it("reports a database readiness failure without affecting liveness", async () => {
    const { app } = await createTestApp({
      databaseReadinessCheck: async () => {
        throw new Error("database unavailable");
      }
    });

    const readyResponse = await app.inject({ method: "GET", url: "/ready" });
    const healthResponse = await app.inject({ method: "GET", url: "/health" });

    expect(readyResponse.statusCode).toBe(503);
    expect(readyResponse.json()).toEqual({ reason: "database", status: "not_ready" });
    expect(healthResponse.statusCode).toBe(200);

    await app.close();
  });

  it("waits for queued persistence writes before closing", async () => {
    const { app, gameRoomService } = await createTestApp();
    let releaseWrites: (() => void) | undefined;
    const pendingWrites = new Promise<void>((resolve) => {
      releaseWrites = resolve;
    });
    vi.spyOn(gameRoomService, "waitForPersistentWrites").mockReturnValue(pendingWrites);
    let closeCompleted = false;

    const closePromise = app.close().then(() => {
      closeCompleted = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(gameRoomService.waitForPersistentWrites).toHaveBeenCalledOnce();
    expect(closeCompleted).toBe(false);
    releaseWrites?.();
    await closePromise;
    expect(closeCompleted).toBe(true);
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
    expect(loginResponse.headers["set-cookie"]).toContain("HttpOnly");

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

  it("lists and reads the current player's game history", async () => {
    const { app, gameRecordRepository } = await createTestApp();

    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        username: "player1",
        password: "player123"
      }
    });
    const token = loginResponse.json<{ token: string }>().token;

    await gameRecordRepository.createRecord({
      humanSeatIndex: 0,
      playerUserId: 2,
      roomId: "quick-history-1",
      ruleName: "simple",
      ruleVersion: 1
    });
    await gameRecordRepository.appendEvent("quick-history-1", {
      createdAt: "2026-06-09T10:00:00.000Z",
      id: "event-history-1",
      text: "player1 加入快速对局"
    });
    await gameRecordRepository.createRecord({
      humanSeatIndex: 0,
      playerUserId: 999,
      roomId: "quick-other-player",
      ruleName: "simple",
      ruleVersion: 1
    });

    const listResponse = await app.inject({
      headers: {
        authorization: `Bearer ${token}`
      },
      method: "GET",
      url: "/games/history"
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      records: [
        {
          roomId: "quick-history-1",
          ruleName: "simple",
          status: "playing"
        }
      ]
    });

    const detailResponse = await app.inject({
      headers: {
        authorization: `Bearer ${token}`
      },
      method: "GET",
      url: "/games/history/quick-history-1"
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      record: {
        events: [
          expect.objectContaining({
            text: "player1 加入快速对局"
          })
        ],
        roomId: "quick-history-1"
      }
    });

    const otherPlayerResponse = await app.inject({
      headers: {
        authorization: `Bearer ${token}`
      },
      method: "GET",
      url: "/games/history/quick-other-player"
    });

    expect(otherPlayerResponse.statusCode).toBe(404);

    await app.close();
  });

  it("restricts game history to authenticated players", async () => {
    const { app } = await createTestApp();
    const adminLoginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        username: "admin",
        password: "admin123"
      }
    });
    const adminToken = adminLoginResponse.json<{ token: string }>().token;

    const anonymousResponse = await app.inject({
      method: "GET",
      url: "/games/history"
    });
    expect(anonymousResponse.statusCode).toBe(401);

    const adminResponse = await app.inject({
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      method: "GET",
      url: "/games/history"
    });
    expect(adminResponse.statusCode).toBe(403);

    await app.close();
  });

  it("allows admins to inspect all game records and details", async () => {
    const {
      app,
      gameLobbyService,
      gameRecordRepository,
      persistenceDiagnosticRegistry,
      playerConnectionRegistry
    } = await createTestApp();
    await gameRecordRepository.createRecord({
      humanSeatIndex: 0,
      playerUserId: 2,
      roomId: "admin-game-player-1",
      ruleName: "simple",
      ruleVersion: 1
    });
    await gameRecordRepository.createRecord({
      humanSeatIndex: 1,
      playerUserId: 3,
      roomId: "admin-game-player-2",
      ruleName: "standard",
      ruleVersion: 1
    });
    await gameRecordRepository.appendEvent("admin-game-player-2", {
      createdAt: "2026-07-08T09:00:00.000Z",
      id: "admin-event-1",
      text: "player2 开始对局"
    });

    const adminLogin = await app.inject({
      method: "POST",
      payload: { password: "admin123", username: "admin" },
      url: "/auth/login"
    });
    const adminToken = adminLogin.json<{ token: string }>().token;
    const playerLogin = await app.inject({
      method: "POST",
      payload: { password: "player123", username: "player1" },
      url: "/auth/login"
    });
    const playerToken = playerLogin.json<{ token: string }>().token;
    gameLobbyService.createRoom({
      createdAt: "2026-07-08T00:00:00.000Z",
      id: 2,
      role: "player",
      updatedAt: "2026-07-08T00:00:00.000Z",
      username: "player1"
    });
    playerConnectionRegistry.connect(2);
    persistenceDiagnosticRegistry.record({
      error: new Error("database locked"),
      operation: "append-event",
      roomId: "admin-game-player-2"
    });

    const listResponse = await app.inject({
      headers: { authorization: `Bearer ${adminToken}` },
      method: "GET",
      url: "/admin/games"
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      records: expect.arrayContaining([
        expect.objectContaining({ roomId: "admin-game-player-1" }),
        expect.objectContaining({
          playerUserId: 3,
          roomId: "admin-game-player-2",
          ruleName: "standard"
        })
      ])
    });

    const detailResponse = await app.inject({
      headers: { authorization: `Bearer ${adminToken}` },
      method: "GET",
      url: "/admin/games/admin-game-player-2"
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      record: {
        events: [expect.objectContaining({ text: "player2 开始对局" })],
        playerUserId: 3,
        roomId: "admin-game-player-2"
      }
    });

    const activeRoomsResponse = await app.inject({
      headers: { authorization: `Bearer ${adminToken}` },
      method: "GET",
      url: "/admin/active-rooms"
    });
    expect(activeRoomsResponse.statusCode).toBe(200);
    expect(activeRoomsResponse.json()).toMatchObject({
      rooms: [
        {
          seats: expect.arrayContaining([
            expect.objectContaining({ connectionStatus: "online", userId: 2 }),
            expect.objectContaining({ connectionStatus: "empty" })
          ]),
          status: "waiting"
        }
      ]
    });

    const diagnosticsResponse = await app.inject({
      headers: { authorization: `Bearer ${adminToken}` },
      method: "GET",
      url: "/admin/persistence-diagnostics"
    });
    expect(diagnosticsResponse.statusCode).toBe(200);
    expect(diagnosticsResponse.json()).toMatchObject({
      diagnostics: [
        {
          message: "database locked",
          operation: "append-event",
          roomId: "admin-game-player-2"
        }
      ]
    });

    const forbiddenResponse = await app.inject({
      headers: { authorization: `Bearer ${playerToken}` },
      method: "GET",
      url: "/admin/games"
    });
    expect(forbiddenResponse.statusCode).toBe(403);
    const forbiddenRoomsResponse = await app.inject({
      headers: { authorization: `Bearer ${playerToken}` },
      method: "GET",
      url: "/admin/active-rooms"
    });
    expect(forbiddenRoomsResponse.statusCode).toBe(403);
    const forbiddenDiagnosticsResponse = await app.inject({
      headers: { authorization: `Bearer ${playerToken}` },
      method: "GET",
      url: "/admin/persistence-diagnostics"
    });
    expect(forbiddenDiagnosticsResponse.statusCode).toBe(403);

    await app.close();
  });

  it("allows players to create, read, and join lobby rooms", async () => {
    const { app, gameLobbyService, gameRoomService } = await createTestApp();

    const ownerLoginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        username: "player1",
        password: "player123"
      }
    });
    const ownerToken = ownerLoginResponse.json<{ token: string }>().token;
    const joinerLoginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        username: "player2",
        password: "player123"
      }
    });
    const joinerToken = joinerLoginResponse.json<{ token: string }>().token;

    const invalidCreateResponse = await app.inject({
      headers: {
        authorization: `Bearer ${ownerToken}`
      },
      method: "POST",
      payload: { ruleName: "unsupported" },
      url: "/rooms"
    });
    expect(invalidCreateResponse.statusCode).toBe(400);

    const createResponse = await app.inject({
      headers: {
        authorization: `Bearer ${ownerToken}`
      },
      method: "POST",
      payload: { ruleName: "standard" },
      url: "/rooms"
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({
      room: { ruleName: "standard", ruleVersion: 1 }
    });
    const roomId = createResponse.json<{ room: { roomId: string } }>().room.roomId;

    const joinResponse = await app.inject({
      headers: {
        authorization: `Bearer ${joinerToken}`
      },
      method: "POST",
      url: `/rooms/${roomId}/join`
    });

    expect(joinResponse.statusCode).toBe(200);
    expect(joinResponse.json()).toMatchObject({
      room: {
        roomId,
        seats: expect.arrayContaining([
          expect.objectContaining({ username: "player1" }),
          expect.objectContaining({ username: "player2" })
        ]),
        status: "waiting"
      }
    });

    const currentResponse = await app.inject({
      headers: {
        authorization: `Bearer ${joinerToken}`
      },
      method: "GET",
      url: "/rooms/current"
    });

    expect(currentResponse.statusCode).toBe(200);
    expect(currentResponse.json()).toMatchObject({
      room: {
        roomId,
        seats: expect.arrayContaining([expect.objectContaining({ username: "player2" })])
      }
    });

    const notReadyResponse = await app.inject({
      headers: {
        authorization: `Bearer ${joinerToken}`
      },
      method: "PATCH",
      url: "/rooms/current/ready",
      payload: {
        isReady: false
      }
    });

    expect(notReadyResponse.statusCode).toBe(200);
    expect(
      gameRoomService.getRoomForUser(
        {
          createdAt: "2026-06-01T00:00:00.000Z",
          id: 2,
          role: "player",
          updatedAt: "2026-06-01T00:00:00.000Z",
          username: "player1"
        },
        roomId
      )
    ).toBeNull();

    const blockedStartResponse = await app.inject({
      headers: {
        authorization: `Bearer ${ownerToken}`
      },
      method: "POST",
      url: "/rooms/current/start"
    });
    expect(blockedStartResponse.statusCode).toBe(409);

    await app.inject({
      headers: {
        authorization: `Bearer ${joinerToken}`
      },
      method: "PATCH",
      url: "/rooms/current/ready",
      payload: {
        isReady: true
      }
    });

    const forbiddenStartResponse = await app.inject({
      headers: {
        authorization: `Bearer ${joinerToken}`
      },
      method: "POST",
      url: "/rooms/current/start"
    });
    expect(forbiddenStartResponse.statusCode).toBe(403);

    const startResponse = await app.inject({
      headers: {
        authorization: `Bearer ${ownerToken}`
      },
      method: "POST",
      url: "/rooms/current/start"
    });

    expect(startResponse.statusCode).toBe(200);
    expect(startResponse.json()).toMatchObject({
      room: {
        roomId,
        seats: expect.arrayContaining([expect.objectContaining({ isBot: true, isReady: true })]),
        status: "playing"
      }
    });
    expect(
      gameRoomService.getRoomForUser(
        {
          createdAt: "2026-06-01T00:00:00.000Z",
          id: 2,
          role: "player",
          updatedAt: "2026-06-01T00:00:00.000Z",
          username: "player1"
        },
        roomId
      )
    ).toMatchObject({
      id: `${roomId}-round-0001`
    });

    const firstGameRound = gameRoomService.getRoom(roomId);
    if (!firstGameRound) {
      throw new Error("Expected first multiplayer game round");
    }
    firstGameRound.state.phase = "ended";
    firstGameRound.state.endReason = "draw";
    gameLobbyService.finishRoom(roomId);
    const forbiddenRematchResponse = await app.inject({
      headers: { authorization: `Bearer ${joinerToken}` },
      method: "POST",
      url: "/rooms/current/rematch"
    });
    expect(forbiddenRematchResponse.statusCode).toBe(403);

    const rematchResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: "POST",
      url: "/rooms/current/rematch"
    });
    expect(rematchResponse.statusCode).toBe(200);
    expect(rematchResponse.json()).toMatchObject({
      room: {
        roomId,
        status: "waiting",
        seats: expect.arrayContaining([
          expect.objectContaining({ isReady: true, username: "player1" }),
          expect.objectContaining({ isReady: false, username: "player2" }),
          expect.objectContaining({ isBot: false, isReady: false })
        ])
      }
    });

    await app.inject({
      headers: { authorization: `Bearer ${joinerToken}` },
      method: "PATCH",
      payload: { isReady: true },
      url: "/rooms/current/ready"
    });
    const secondStartResponse = await app.inject({
      headers: { authorization: `Bearer ${ownerToken}` },
      method: "POST",
      url: "/rooms/current/start"
    });
    expect(secondStartResponse.statusCode).toBe(200);
    expect(
      gameRoomService.getRoomForUser(
        {
          createdAt: "2026-06-01T00:00:00.000Z",
          id: 2,
          role: "player",
          updatedAt: "2026-06-01T00:00:00.000Z",
          username: "player1"
        },
        roomId
      )
    ).toMatchObject({ id: `${roomId}-round-0002` });
    expect(
      gameRoomService.getRoomForUser(
        {
          createdAt: "2026-06-01T00:00:00.000Z",
          id: 3,
          role: "player",
          updatedAt: "2026-06-01T00:00:00.000Z",
          username: "player2"
        },
        roomId
      )
    ).toMatchObject({
      id: `${roomId}-round-0002`
    });

    await app.close();
  });

  it("allows players to leave waiting lobby rooms", async () => {
    const { app } = await createTestApp();

    const ownerLoginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        username: "player1",
        password: "player123"
      }
    });
    const ownerToken = ownerLoginResponse.json<{ token: string }>().token;
    const joinerLoginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        username: "player2",
        password: "player123"
      }
    });
    const joinerToken = joinerLoginResponse.json<{ token: string }>().token;

    const createResponse = await app.inject({
      headers: {
        authorization: `Bearer ${ownerToken}`
      },
      method: "POST",
      url: "/rooms"
    });
    const roomId = createResponse.json<{ room: { roomId: string } }>().room.roomId;
    await app.inject({
      headers: {
        authorization: `Bearer ${joinerToken}`
      },
      method: "POST",
      url: `/rooms/${roomId}/join`
    });

    const leaveResponse = await app.inject({
      headers: {
        authorization: `Bearer ${joinerToken}`
      },
      method: "DELETE",
      url: "/rooms/current"
    });

    expect(leaveResponse.statusCode).toBe(200);
    const leaveBody = leaveResponse.json<{
      room: {
        ownerUserId: number;
        roomId: string;
        seats: Array<{ seatIndex: number; userId?: number }>;
      };
    }>();
    expect(leaveBody).toMatchObject({
      room: {
        ownerUserId: 2,
        roomId
      }
    });
    expect(leaveBody.room.seats[1]).toMatchObject({ seatIndex: 1 });
    expect(leaveBody.room.seats[1]?.userId).toBeUndefined();

    const currentResponse = await app.inject({
      headers: {
        authorization: `Bearer ${joinerToken}`
      },
      method: "GET",
      url: "/rooms/current"
    });
    expect(currentResponse.json()).toEqual({ room: null });

    await app.close();
  });

  it("restricts lobby room routes to authenticated players", async () => {
    const { app } = await createTestApp();
    const adminLoginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        username: "admin",
        password: "admin123"
      }
    });
    const adminToken = adminLoginResponse.json<{ token: string }>().token;

    const anonymousResponse = await app.inject({
      method: "POST",
      url: "/rooms"
    });
    expect(anonymousResponse.statusCode).toBe(401);

    const adminResponse = await app.inject({
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      method: "POST",
      url: "/rooms"
    });
    expect(adminResponse.statusCode).toBe(403);

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
      expect.arrayContaining([expect.objectContaining({ username: "new_player" })])
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

  it("allows admins to reset player passwords", async () => {
    const { app, userRepository } = await createTestApp();
    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        username: "admin",
        password: "admin123"
      }
    });
    const token = loginResponse.json<{ token: string }>().token;
    const player = await userRepository.findByUsername("player1");

    const resetResponse = await app.inject({
      headers: {
        authorization: `Bearer ${token}`
      },
      method: "PATCH",
      url: `/admin/players/${player?.id ?? 0}/password`,
      payload: {
        password: "newpass123"
      }
    });

    expect(resetResponse.statusCode).toBe(200);
    expect(resetResponse.json()).toEqual({ ok: true });

    const updatedPlayer = await userRepository.findByUsername("player1");
    expect(updatedPlayer).not.toBeNull();
    expect(await verifyPassword("newpass123", updatedPlayer?.passwordHash ?? "")).toBe(true);

    const playerLoginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        username: "player1",
        password: "newpass123"
      }
    });
    expect(playerLoginResponse.statusCode).toBe(200);

    await app.close();
  });

  it("rejects invalid player password reset requests", async () => {
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

    const invalidResponse = await app.inject({
      headers: {
        authorization: `Bearer ${token}`
      },
      method: "PATCH",
      url: "/admin/players/2/password",
      payload: {
        password: "123"
      }
    });
    expect(invalidResponse.statusCode).toBe(400);

    const notFoundResponse = await app.inject({
      headers: {
        authorization: `Bearer ${token}`
      },
      method: "PATCH",
      url: "/admin/players/999/password",
      payload: {
        password: "newpass123"
      }
    });
    expect(notFoundResponse.statusCode).toBe(404);

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
