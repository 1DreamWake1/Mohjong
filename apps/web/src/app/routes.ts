import type { UserRole } from "@mahjong/shared";

export const APP_ROUTES = {
  adminUsers: "/admin/players",
  lobby: "/lobby",
  login: "/login"
} as const;

type RouteAuthState =
  | { status: "checking"; role?: never }
  | { status: "anonymous"; role?: never }
  | { status: "authenticated"; role: UserRole };

export function getRouteForAuth(state: RouteAuthState): string | null {
  if (state.status === "checking") {
    return null;
  }

  if (state.status === "anonymous") {
    return APP_ROUTES.login;
  }

  return state.role === "admin" ? APP_ROUTES.adminUsers : APP_ROUTES.lobby;
}

export function replaceRoute(path: string): void {
  if (window.location.pathname !== path) {
    window.history.replaceState(null, "", path);
  }
}
