import type { FastifyInstance } from "fastify";
import type {
  CreatePlayerRequest,
  CreateGameRoomRequest,
  GetAdminGameRecordResponse,
  GetGameHistoryResponse,
  CreateGameRoomResponse,
  ListGameHistoryResponse,
  ListAdminGameRecordsResponse,
  ListAdminActiveRoomsResponse,
  ListAdminPersistenceDiagnosticsResponse,
  GetCurrentGameRoomResponse,
  JoinGameRoomResponse,
  LeaveGameRoomResponse,
  LoginRequest,
  LogoutResponse,
  ResetPlayerPasswordRequest,
  ResetGameRoomResponse,
  SetGameRoomReadyRequest,
  SetGameRoomReadyResponse,
  StartGameRoomResponse
} from "@mahjong/shared";

import type { AuthService } from "../modules/auth/authService.js";
import type { ServerLifecycle } from "../lifecycle/serverLifecycle.js";
import type { GameRecordRepository } from "../modules/game/gameRecordRepository.js";
import type { GameLobbyService } from "../modules/game/gameLobbyService.js";
import type { GameRoomService } from "../modules/game/gameRoomService.js";
import type { PlayerConnectionRegistry } from "../modules/game/playerConnectionRegistry.js";
import type { PersistenceDiagnosticRegistry } from "../modules/game/persistenceDiagnosticRegistry.js";
import type { RateLimiter } from "../security/rateLimiter.js";
import type { createUserService } from "../modules/users/userService.js";

type RouteServices = {
  authService: AuthService;
  databaseReadinessCheck: () => Promise<void>;
  gameLobbyService: GameLobbyService;
  gameRecordRepository: GameRecordRepository;
  gameRoomService: GameRoomService;
  lifecycle: ServerLifecycle;
  loginRateLimiter: RateLimiter;
  playerConnectionRegistry: PlayerConnectionRegistry;
  persistenceDiagnosticRegistry: PersistenceDiagnosticRegistry;
  userService: ReturnType<typeof createUserService>;
};

type AuthenticatedUser =
  Awaited<ReturnType<AuthService["getCurrentUser"]>> extends infer Result
    ? NonNullable<Result>
    : never;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function parseLoginRequest(value: unknown): LoginRequest | null {
  if (!isRecord(value)) {
    return null;
  }

  const { username, password } = value;
  if (typeof username !== "string" || typeof password !== "string") {
    return null;
  }

  return { username, password };
}

function parseCreatePlayerRequest(value: unknown): CreatePlayerRequest | null {
  if (!isRecord(value)) {
    return null;
  }

  const { username, password } = value;
  if (typeof username !== "string" || typeof password !== "string") {
    return null;
  }

  return { username, password };
}

function parseResetPlayerPasswordRequest(value: unknown): ResetPlayerPasswordRequest | null {
  if (!isRecord(value)) {
    return null;
  }

  const { password } = value;
  if (typeof password !== "string") {
    return null;
  }

  return { password };
}

function parseSetGameRoomReadyRequest(value: unknown): SetGameRoomReadyRequest | null {
  if (!isRecord(value) || typeof value.isReady !== "boolean") {
    return null;
  }

  return { isReady: value.isReady };
}

function parseCreateGameRoomRequest(value: unknown): CreateGameRoomRequest | null {
  if (value === undefined || value === null) {
    return {};
  }
  if (!isRecord(value)) {
    return null;
  }
  if (
    value.ruleName !== undefined &&
    value.ruleName !== "simple" &&
    value.ruleName !== "standard" &&
    value.ruleName !== "sichuan" &&
    value.ruleName !== "sichuan-tournament"
  ) {
    return null;
  }
  return value.ruleName === undefined ? {} : { ruleName: value.ruleName };
}

function parseIdParam(value: unknown): number | null {
  if (!isRecord(value) || typeof value.id !== "string") {
    return null;
  }

  const id = Number(value.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseRoomIdParam(value: unknown): string | null {
  if (!isRecord(value) || typeof value.roomId !== "string" || value.roomId.length === 0) {
    return null;
  }

  return value.roomId;
}

function readBearerToken(authorizationHeader: unknown): string | null {
  if (typeof authorizationHeader !== "string") {
    return null;
  }

  const [scheme, token, extra] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || !token || extra !== undefined) {
    return null;
  }

  return token;
}

async function requireUser(
  app: FastifyInstance,
  services: RouteServices,
  authorizationHeader: unknown
): Promise<AuthenticatedUser | null> {
  const token = readBearerToken(authorizationHeader);
  if (!token) {
    return null;
  }

  const user = await services.authService.getCurrentUser(token);
  if (!user) {
    app.log.warn("Rejected request with invalid auth token");
    return null;
  }

  return user;
}

export async function registerRoutes(app: FastifyInstance, services: RouteServices): Promise<void> {
  app.get("/health", async () => ({
    status: "ok"
  }));

  app.get("/ready", async (_request, reply) => {
    const lifecycleState = services.lifecycle.getReadinessState();
    if (lifecycleState !== "ready") {
      return reply.code(503).send({ reason: lifecycleState, status: "not_ready" });
    }

    try {
      await services.databaseReadinessCheck();
      return { status: "ready" };
    } catch (error) {
      app.log.error({ err: error }, "Database readiness check failed");
      return reply.code(503).send({ reason: "database", status: "not_ready" });
    }
  });

  app.post("/auth/login", async (request, reply) => {
    // 按客户端 IP 限制登录尝试频率，缓解暴力破解。
    const clientIp = request.ip ?? "unknown";
    if (!services.loginRateLimiter.isAllowed(`login:${clientIp}`)) {
      return reply.code(429).send({ message: "Too many login attempts, try again later" });
    }

    const input = parseLoginRequest(request.body);
    if (!input) {
      return reply.code(400).send({ message: "Invalid login request" });
    }

    const result = await services.authService.login(input);
    if (!result) {
      return reply.code(401).send({ message: "Invalid username or password" });
    }

    return result;
  });

  app.get("/auth/me", async (request, reply) => {
    const user = await requireUser(app, services, request.headers.authorization);

    if (!user) {
      return reply.code(401).send({ message: "Unauthorized" });
    }

    return { user };
  });

  app.post(
    "/auth/logout",
    async (): Promise<LogoutResponse> => ({
      ok: true
    })
  );

  app.get("/rooms/current", async (request, reply): Promise<GetCurrentGameRoomResponse | void> => {
    const user = await requireUser(app, services, request.headers.authorization);

    if (!user) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    if (user.role !== "player") {
      return reply.code(403).send({ message: "Forbidden" });
    }

    return { room: services.gameLobbyService.getCurrentRoom(user) };
  });

  app.post("/rooms", async (request, reply): Promise<CreateGameRoomResponse | void> => {
    const user = await requireUser(app, services, request.headers.authorization);

    if (!user) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    if (user.role !== "player") {
      return reply.code(403).send({ message: "Forbidden" });
    }

    const input = parseCreateGameRoomRequest(request.body);
    if (!input) {
      return reply.code(400).send({ message: "Invalid game room request" });
    }

    return reply
      .code(201)
      .send({ room: services.gameLobbyService.createRoom(user, input.ruleName) });
  });

  app.post("/rooms/:roomId/join", async (request, reply): Promise<JoinGameRoomResponse | void> => {
    const user = await requireUser(app, services, request.headers.authorization);

    if (!user) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    if (user.role !== "player") {
      return reply.code(403).send({ message: "Forbidden" });
    }

    const roomId = parseRoomIdParam(request.params);
    if (!roomId) {
      return reply.code(400).send({ message: "Invalid room id" });
    }

    const result = services.gameLobbyService.joinRoom(user, roomId);
    if (!result.ok && result.reason === "not_found") {
      return reply.code(404).send({ message: "Room not found" });
    }
    if (!result.ok && result.reason === "full") {
      return reply.code(409).send({ message: "Room is full" });
    }
    if (!result.ok) {
      return reply.code(409).send({ message: "Player is already in another room" });
    }

    return { room: result.room };
  });

  app.delete("/rooms/current", async (request, reply): Promise<LeaveGameRoomResponse | void> => {
    const user = await requireUser(app, services, request.headers.authorization);

    if (!user) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    if (user.role !== "player") {
      return reply.code(403).send({ message: "Forbidden" });
    }

    const result = services.gameLobbyService.leaveRoom(user);
    if (!result.ok && result.reason === "not_found") {
      return reply.code(404).send({ message: "Room not found" });
    }
    if (!result.ok) {
      return reply.code(409).send({ message: "Room is currently playing" });
    }

    return { room: result.room };
  });

  app.patch(
    "/rooms/current/ready",
    async (request, reply): Promise<SetGameRoomReadyResponse | void> => {
      const user = await requireUser(app, services, request.headers.authorization);

      if (!user) {
        return reply.code(401).send({ message: "Unauthorized" });
      }
      if (user.role !== "player") {
        return reply.code(403).send({ message: "Forbidden" });
      }

      const input = parseSetGameRoomReadyRequest(request.body);
      if (!input) {
        return reply.code(400).send({ message: "Invalid ready request" });
      }

      const result = services.gameLobbyService.setReady(user, input.isReady);
      if (!result.ok && result.reason === "not_found") {
        return reply.code(404).send({ message: "Room not found" });
      }
      if (!result.ok) {
        return reply.code(409).send({ message: "Room has already started" });
      }

      return { room: result.room };
    }
  );

  app.post(
    "/rooms/current/rematch",
    async (request, reply): Promise<ResetGameRoomResponse | void> => {
      const user = await requireUser(app, services, request.headers.authorization);
      if (!user) {
        return reply.code(401).send({ message: "Unauthorized" });
      }
      if (user.role !== "player") {
        return reply.code(403).send({ message: "Forbidden" });
      }

      const result = services.gameLobbyService.resetRoomForRematch(user);
      if (!result.ok && result.reason === "not_found") {
        return reply.code(404).send({ message: "Room not found" });
      }
      if (!result.ok && result.reason === "forbidden") {
        return reply.code(403).send({ message: "Only room owner can restart the room" });
      }
      if (!result.ok) {
        return reply.code(409).send({ message: "Room has not ended" });
      }

      return { room: result.room };
    }
  );

  app.post(
    "/rooms/current/start",
    async (request, reply): Promise<StartGameRoomResponse | void> => {
      const user = await requireUser(app, services, request.headers.authorization);

      if (!user) {
        return reply.code(401).send({ message: "Unauthorized" });
      }
      if (user.role !== "player") {
        return reply.code(403).send({ message: "Forbidden" });
      }

      const result = services.gameLobbyService.startRoom(user);
      if (!result.ok && result.reason === "not_found") {
        return reply.code(404).send({ message: "Room not found" });
      }
      if (!result.ok && result.reason === "forbidden") {
        return reply.code(403).send({ message: "Only room owner can start the room" });
      }
      if (!result.ok && result.reason === "not_ready") {
        return reply.code(409).send({ message: "Not all players are ready" });
      }
      if (!result.ok) {
        return reply.code(409).send({ message: "Room has already started" });
      }

      services.gameRoomService.createRoomFromLobby(result.room);
      return { room: result.room };
    }
  );

  app.get("/games/history", async (request, reply): Promise<ListGameHistoryResponse | void> => {
    const user = await requireUser(app, services, request.headers.authorization);

    if (!user) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    if (user.role !== "player") {
      return reply.code(403).send({ message: "Forbidden" });
    }

    return {
      records: await services.gameRecordRepository.listRecordsForPlayer(user.id)
    };
  });

  app.get(
    "/games/history/:roomId",
    async (request, reply): Promise<GetGameHistoryResponse | void> => {
      const user = await requireUser(app, services, request.headers.authorization);

      if (!user) {
        return reply.code(401).send({ message: "Unauthorized" });
      }
      if (user.role !== "player") {
        return reply.code(403).send({ message: "Forbidden" });
      }

      const roomId = parseRoomIdParam(request.params);
      if (!roomId) {
        return reply.code(400).send({ message: "Invalid room id" });
      }

      const record = await services.gameRecordRepository.getRecordForPlayer(user.id, roomId);
      if (!record) {
        return reply.code(404).send({ message: "Game record not found" });
      }

      return { record };
    }
  );

  app.get("/admin/players", async (request, reply) => {
    const user = await requireUser(app, services, request.headers.authorization);

    if (!user) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    if (user.role !== "admin") {
      return reply.code(403).send({ message: "Forbidden" });
    }

    return { players: await services.userService.listPlayers() };
  });

  app.get("/admin/games", async (request, reply): Promise<ListAdminGameRecordsResponse | void> => {
    const user = await requireUser(app, services, request.headers.authorization);
    if (!user) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    if (user.role !== "admin") {
      return reply.code(403).send({ message: "Forbidden" });
    }

    return { records: await services.gameRecordRepository.listRecordsForAdmin() };
  });

  app.get(
    "/admin/active-rooms",
    async (request, reply): Promise<ListAdminActiveRoomsResponse | void> => {
      const user = await requireUser(app, services, request.headers.authorization);
      if (!user) {
        return reply.code(401).send({ message: "Unauthorized" });
      }
      if (user.role !== "admin") {
        return reply.code(403).send({ message: "Forbidden" });
      }

      return {
        rooms: services.gameLobbyService.listRooms().map((room) => ({
          ...room,
          seats: room.seats.map((seat) => ({
            ...seat,
            connectionStatus: seat.isBot
              ? "bot"
              : seat.userId === undefined
                ? "empty"
                : services.playerConnectionRegistry.isOnline(seat.userId)
                  ? "online"
                  : "disconnected"
          }))
        }))
      };
    }
  );

  app.get(
    "/admin/persistence-diagnostics",
    async (request, reply): Promise<ListAdminPersistenceDiagnosticsResponse | void> => {
      const user = await requireUser(app, services, request.headers.authorization);
      if (!user) {
        return reply.code(401).send({ message: "Unauthorized" });
      }
      if (user.role !== "admin") {
        return reply.code(403).send({ message: "Forbidden" });
      }

      return { diagnostics: services.persistenceDiagnosticRegistry.list() };
    }
  );

  app.get(
    "/admin/games/:roomId",
    async (request, reply): Promise<GetAdminGameRecordResponse | void> => {
      const user = await requireUser(app, services, request.headers.authorization);
      if (!user) {
        return reply.code(401).send({ message: "Unauthorized" });
      }
      if (user.role !== "admin") {
        return reply.code(403).send({ message: "Forbidden" });
      }

      const roomId = parseRoomIdParam(request.params);
      if (!roomId) {
        return reply.code(400).send({ message: "Invalid room id" });
      }

      const record = await services.gameRecordRepository.getRecordForAdmin(roomId);
      return record ? { record } : reply.code(404).send({ message: "Game record not found" });
    }
  );

  app.post("/admin/players", async (request, reply) => {
    const user = await requireUser(app, services, request.headers.authorization);

    if (!user) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    if (user.role !== "admin") {
      return reply.code(403).send({ message: "Forbidden" });
    }

    const input = parseCreatePlayerRequest(request.body);
    if (!input) {
      return reply.code(400).send({ message: "Invalid player request" });
    }

    const result = await services.userService.createPlayer(input);
    if (!result.ok && result.reason === "duplicate_username") {
      return reply.code(409).send({ message: "Username already exists" });
    }
    if (!result.ok) {
      return reply.code(400).send({ message: "Invalid username or password" });
    }

    return reply.code(201).send({ player: result.player });
  });

  app.delete("/admin/players/:id", async (request, reply) => {
    const user = await requireUser(app, services, request.headers.authorization);

    if (!user) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    if (user.role !== "admin") {
      return reply.code(403).send({ message: "Forbidden" });
    }

    const id = parseIdParam(request.params);
    if (!id) {
      return reply.code(400).send({ message: "Invalid player id" });
    }

    const deleted = await services.userService.deletePlayer(id);
    return deleted ? reply.code(204).send() : reply.code(404).send({ message: "Player not found" });
  });

  app.patch("/admin/players/:id/password", async (request, reply) => {
    const user = await requireUser(app, services, request.headers.authorization);

    if (!user) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    if (user.role !== "admin") {
      return reply.code(403).send({ message: "Forbidden" });
    }

    const id = parseIdParam(request.params);
    if (!id) {
      return reply.code(400).send({ message: "Invalid player id" });
    }

    const input = parseResetPlayerPasswordRequest(request.body);
    if (!input) {
      return reply.code(400).send({ message: "Invalid password request" });
    }

    const result = await services.userService.resetPlayerPassword(id, input);
    if (result === "invalid_input") {
      return reply.code(400).send({ message: "Invalid password" });
    }
    if (result === "not_found") {
      return reply.code(404).send({ message: "Player not found" });
    }

    return { ok: true };
  });
}
