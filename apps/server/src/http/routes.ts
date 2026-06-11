import type { FastifyInstance } from "fastify";
import type {
  CreatePlayerRequest,
  GetGameHistoryResponse,
  CreateGameRoomResponse,
  ListGameHistoryResponse,
  GetCurrentGameRoomResponse,
  JoinGameRoomResponse,
  LoginRequest,
  LogoutResponse,
  ResetPlayerPasswordRequest,
  SetGameRoomReadyRequest,
  SetGameRoomReadyResponse,
  StartGameRoomResponse
} from "@mahjong/shared";

import type { AuthService } from "../modules/auth/authService.js";
import type { GameRecordRepository } from "../modules/game/gameRecordRepository.js";
import type { GameLobbyService } from "../modules/game/gameLobbyService.js";
import type { createUserService } from "../modules/users/userService.js";

type RouteServices = {
  authService: AuthService;
  gameLobbyService: GameLobbyService;
  gameRecordRepository: GameRecordRepository;
  userService: ReturnType<typeof createUserService>;
};

type AuthenticatedUser = Awaited<
  ReturnType<AuthService["getCurrentUser"]>
> extends infer Result
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

function parseResetPlayerPasswordRequest(
  value: unknown
): ResetPlayerPasswordRequest | null {
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

export async function registerRoutes(
  app: FastifyInstance,
  services: RouteServices
): Promise<void> {
  app.get("/health", async () => ({
    status: "ok"
  }));

  app.post("/auth/login", async (request, reply) => {
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
    const user = await requireUser(
      app,
      services,
      request.headers.authorization
    );

    if (!user) {
      return reply.code(401).send({ message: "Unauthorized" });
    }

    return { user };
  });

  app.post("/auth/logout", async (): Promise<LogoutResponse> => ({
    ok: true
  }));

  app.get("/rooms/current", async (request, reply): Promise<GetCurrentGameRoomResponse | void> => {
    const user = await requireUser(
      app,
      services,
      request.headers.authorization
    );

    if (!user) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    if (user.role !== "player") {
      return reply.code(403).send({ message: "Forbidden" });
    }

    return { room: services.gameLobbyService.getCurrentRoom(user) };
  });

  app.post("/rooms", async (request, reply): Promise<CreateGameRoomResponse | void> => {
    const user = await requireUser(
      app,
      services,
      request.headers.authorization
    );

    if (!user) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    if (user.role !== "player") {
      return reply.code(403).send({ message: "Forbidden" });
    }

    return reply.code(201).send({ room: services.gameLobbyService.createRoom(user) });
  });

  app.post(
    "/rooms/:roomId/join",
    async (request, reply): Promise<JoinGameRoomResponse | void> => {
      const user = await requireUser(
        app,
        services,
        request.headers.authorization
      );

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
    }
  );

  app.patch(
    "/rooms/current/ready",
    async (request, reply): Promise<SetGameRoomReadyResponse | void> => {
      const user = await requireUser(
        app,
        services,
        request.headers.authorization
      );

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
    "/rooms/current/start",
    async (request, reply): Promise<StartGameRoomResponse | void> => {
      const user = await requireUser(
        app,
        services,
        request.headers.authorization
      );

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

      return { room: result.room };
    }
  );

  app.get("/games/history", async (request, reply): Promise<ListGameHistoryResponse | void> => {
    const user = await requireUser(
      app,
      services,
      request.headers.authorization
    );

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
      const user = await requireUser(
        app,
        services,
        request.headers.authorization
      );

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
    const user = await requireUser(
      app,
      services,
      request.headers.authorization
    );

    if (!user) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    if (user.role !== "admin") {
      return reply.code(403).send({ message: "Forbidden" });
    }

    return { players: await services.userService.listPlayers() };
  });

  app.post("/admin/players", async (request, reply) => {
    const user = await requireUser(
      app,
      services,
      request.headers.authorization
    );

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
    const user = await requireUser(
      app,
      services,
      request.headers.authorization
    );

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
    return deleted
      ? reply.code(204).send()
      : reply.code(404).send({ message: "Player not found" });
  });

  app.patch("/admin/players/:id/password", async (request, reply) => {
    const user = await requireUser(
      app,
      services,
      request.headers.authorization
    );

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
