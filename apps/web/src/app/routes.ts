import type { UserRole } from "@mahjong/shared";

export const APP_ROUTES = {
  adminUsers: "/admin/players",
  gameDemo: "/game/demo",
  gameHistory: "/game/history",
  home: "/",
  lobby: "/lobby",
  login: "/login"
} as const;

export const ROUTE_CHANGE_EVENT = "mahjong:route-change";

type BrowserRouteTarget = {
  dispatchEvent: (event: Event) => boolean;
  history: {
    replaceState: (data: unknown, unused: string, url?: string | URL | null) => void;
  };
  location: {
    pathname: string;
  };
};

type RouteAuthState =
  | { status: "checking"; role?: never }
  | { status: "anonymous"; role?: never }
  | { status: "authenticated"; role: UserRole };

function getDefaultAuthenticatedRoute(role: UserRole): string {
  return role === "admin" ? APP_ROUTES.adminUsers : APP_ROUTES.lobby;
}

function isKnownRoute(path: string): boolean {
  return Object.values(APP_ROUTES).includes(path as (typeof APP_ROUTES)[keyof typeof APP_ROUTES]);
}

export function getRouteForAuth(state: RouteAuthState, requestedPath?: string): string | null {
  const currentPath =
    requestedPath ?? (typeof window === "undefined" ? APP_ROUTES.login : window.location.pathname);

  if (state.status === "checking") {
    return null;
  }

  if (state.status === "anonymous") {
    return currentPath === APP_ROUTES.home || currentPath === APP_ROUTES.login
      ? null
      : APP_ROUTES.login;
  }

  const defaultRoute = getDefaultAuthenticatedRoute(state.role);
  if (!isKnownRoute(currentPath) || currentPath === APP_ROUTES.login) {
    return defaultRoute;
  }

  if (state.role === "player" && currentPath === APP_ROUTES.adminUsers) {
    return APP_ROUTES.lobby;
  }

  if (
    state.role === "admin" &&
    (currentPath === APP_ROUTES.lobby ||
      currentPath === APP_ROUTES.gameDemo ||
      currentPath === APP_ROUTES.gameHistory)
  ) {
    return APP_ROUTES.adminUsers;
  }

  return currentPath;
}

export function replaceRoute(path: string, targetWindow: BrowserRouteTarget = window): void {
  if (targetWindow.location.pathname !== path) {
    targetWindow.history.replaceState(null, "", path);
    targetWindow.dispatchEvent(new Event(ROUTE_CHANGE_EVENT));
  }
}
