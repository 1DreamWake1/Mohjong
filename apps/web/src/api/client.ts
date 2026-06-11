import type {
  AuthUser,
  CreatePlayerRequest,
  CreateGameRoomResponse,
  GetGameHistoryResponse,
  GetCurrentGameRoomResponse,
  GameHistoryDetail,
  GameHistoryItem,
  GameLobbyRoom,
  JoinGameRoomResponse,
  LeaveGameRoomResponse,
  LoginRequest,
  ListGameHistoryResponse,
  LoginResponse,
  LogoutResponse,
  PlayerListResponse,
  ResetPlayerPasswordRequest,
  SetGameRoomReadyRequest,
  SetGameRoomReadyResponse,
  StartGameRoomResponse,
  UserSummary
} from "@mahjong/shared";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  `${window.location.protocol}//${window.location.hostname}:3000`;

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

export async function deletePlayer(
  token: string,
  playerId: number
): Promise<void> {
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

export async function getGameHistory(
  token: string,
  roomId: string
): Promise<GameHistoryDetail> {
  const response = await request<GetGameHistoryResponse>(
    `/games/history/${encodeURIComponent(roomId)}`,
    { token }
  );
  return response.record;
}

export async function getCurrentGameRoom(token: string): Promise<GameLobbyRoom | null> {
  const response = await request<GetCurrentGameRoomResponse>("/rooms/current", { token });
  return response.room;
}

export async function createGameRoom(token: string): Promise<GameLobbyRoom> {
  const response = await request<CreateGameRoomResponse>("/rooms", {
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
