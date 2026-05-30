import type {
  AuthUser,
  CreatePlayerRequest,
  LoginRequest,
  LoginResponse,
  LogoutResponse,
  PlayerListResponse,
  UserSummary
} from "@mahjong/shared";

const API_BASE_URL =
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
