import type {
  AuthUser,
  AdminGameHistoryDetail,
  AdminGameHistoryItem,
  AdminActiveRoom,
  AdminPersistenceDiagnostic,
  CreatePlayerRequest,
  CreateGameRoomResponse,
  CreateGameRoomRequest,
  GetGameHistoryResponse,
  GetCurrentGameRoomResponse,
  GameHistoryDetail,
  GameHistoryItem,
  GetAdminGameRecordResponse,
  GameLobbyRoom,
  JoinGameRoomResponse,
  LeaveGameRoomResponse,
  LoginRequest,
  ListGameHistoryResponse,
  ListAdminGameRecordsResponse,
  ListAdminActiveRoomsResponse,
  ListAdminPersistenceDiagnosticsResponse,
  LoginResponse,
  LogoutResponse,
  PlayerListResponse,
  ResetPlayerPasswordRequest,
  ResetGameRoomResponse,
  SetGameRoomReadyRequest,
  SetGameRoomReadyResponse,
  StartGameRoomResponse,
  UserSummary
} from "@mahjong/shared";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? window.location.origin;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (options.token) {
    headers.set("authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string };
      message = body.message ?? message;
    } catch {
      // Keep the generic status message when the server returns no JSON body.
    }

    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function login(input: LoginRequest): Promise<LoginResponse> {
  return request<LoginResponse>("/auth/login", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function getCurrentUser(token: string): Promise<AuthUser> {
  const response = await request<{ user: AuthUser }>("/auth/me", { token });
  return response.user;
}

export async function logout(token: string): Promise<LogoutResponse> {
  return request<LogoutResponse>("/auth/logout", {
    method: "POST",
    token
  });
}

export async function listPlayers(token: string): Promise<UserSummary[]> {
  const response = await request<PlayerListResponse>("/admin/players", { token });
  return response.players;
}

export async function createPlayer(
  token: string,
  input: CreatePlayerRequest
): Promise<UserSummary> {
  const response = await request<{ player: UserSummary }>("/admin/players", {
    body: JSON.stringify(input),
    method: "POST",
    token
  });
  return response.player;
}

export async function deletePlayer(token: string, playerId: number): Promise<void> {
  await request<void>(`/admin/players/${playerId}`, {
    method: "DELETE",
    token
  });
}

export async function resetPlayerPassword(
  token: string,
  playerId: number,
  input: ResetPlayerPasswordRequest
): Promise<void> {
  await request<{ ok: true }>(`/admin/players/${playerId}/password`, {
    body: JSON.stringify(input),
    method: "PATCH",
    token
  });
}

export async function listGameHistory(token: string): Promise<GameHistoryItem[]> {
  const response = await request<ListGameHistoryResponse>("/games/history", { token });
  return response.records;
}

export async function getGameHistory(token: string, roomId: string): Promise<GameHistoryDetail> {
  const response = await request<GetGameHistoryResponse>(
    `/games/history/${encodeURIComponent(roomId)}`,
    { token }
  );
  return response.record;
}

export async function listAdminGameRecords(token: string): Promise<AdminGameHistoryItem[]> {
  const response = await request<ListAdminGameRecordsResponse>("/admin/games", { token });
  return response.records;
}

export async function listAdminActiveRooms(token: string): Promise<AdminActiveRoom[]> {
  const response = await request<ListAdminActiveRoomsResponse>("/admin/active-rooms", { token });
  return response.rooms;
}

export async function listAdminPersistenceDiagnostics(
  token: string
): Promise<AdminPersistenceDiagnostic[]> {
  const response = await request<ListAdminPersistenceDiagnosticsResponse>(
    "/admin/persistence-diagnostics",
    { token }
  );
  return response.diagnostics;
}

export async function getAdminGameRecord(
  token: string,
  roomId: string
): Promise<AdminGameHistoryDetail> {
  const response = await request<GetAdminGameRecordResponse>(
    `/admin/games/${encodeURIComponent(roomId)}`,
    { token }
  );
  return response.record;
}

export async function getCurrentGameRoom(token: string): Promise<GameLobbyRoom | null> {
  const response = await request<GetCurrentGameRoomResponse>("/rooms/current", { token });
  return response.room;
}

export async function createGameRoom(
  token: string,
  input: CreateGameRoomRequest = {}
): Promise<GameLobbyRoom> {
  const response = await request<CreateGameRoomResponse>("/rooms", {
    body: JSON.stringify(input),
    method: "POST",
    token
  });
  return response.room;
}

export async function joinGameRoom(token: string, roomId: string): Promise<GameLobbyRoom> {
  const response = await request<JoinGameRoomResponse>(
    `/rooms/${encodeURIComponent(roomId)}/join`,
    {
      method: "POST",
      token
    }
  );
  return response.room;
}

export async function leaveCurrentGameRoom(token: string): Promise<GameLobbyRoom | null> {
  const response = await request<LeaveGameRoomResponse>("/rooms/current", {
    method: "DELETE",
    token
  });
  return response.room;
}

export async function setGameRoomReady(
  token: string,
  input: SetGameRoomReadyRequest
): Promise<GameLobbyRoom> {
  const response = await request<SetGameRoomReadyResponse>("/rooms/current/ready", {
    body: JSON.stringify(input),
    method: "PATCH",
    token
  });
  return response.room;
}

export async function startGameRoom(token: string): Promise<GameLobbyRoom> {
  const response = await request<StartGameRoomResponse>("/rooms/current/start", {
    method: "POST",
    token
  });
  return response.room;
}

export async function resetGameRoomForRematch(token: string): Promise<GameLobbyRoom> {
  const response = await request<ResetGameRoomResponse>("/rooms/current/rematch", {
    method: "POST",
    token
  });
  return response.room;
}
