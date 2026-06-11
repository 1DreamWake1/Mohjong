import type { Mock } from "vitest";
import { describe, expect, it, vi } from "vitest";

import { APP_ROUTES, ROUTE_CHANGE_EVENT, getRouteForAuth, replaceRoute } from "./routes.js";

function createRouteTarget(pathname: string): {
  dispatchEvent: Mock;
  history: { replaceState: Mock };
  location: { pathname: string };
} {
  const target = {
    dispatchEvent: vi.fn(),
    history: {
      replaceState: vi.fn((_state, _title, path: string) => {
        target.location.pathname = path;
      })
    },
    location: { pathname }
  };

  return target;
}

describe("app routes", () => {
  it("does not redirect while restoring authentication", () => {
    expect(getRouteForAuth({ status: "checking" })).toBeNull();
  });

  it("routes anonymous users to login", () => {
    expect(getRouteForAuth({ status: "anonymous" }, APP_ROUTES.lobby)).toBe(APP_ROUTES.login);
  });

  it("routes administrators to player account management", () => {
    expect(getRouteForAuth({ role: "admin", status: "authenticated" }, "/login")).toBe(
      APP_ROUTES.adminUsers
    );
  });

  it("keeps administrators on player account management", () => {
    expect(getRouteForAuth({ role: "admin", status: "authenticated" }, APP_ROUTES.adminUsers)).toBe(
      APP_ROUTES.adminUsers
    );
  });

  it("prevents administrators from entering the player lobby", () => {
    expect(getRouteForAuth({ role: "admin", status: "authenticated" }, APP_ROUTES.lobby)).toBe(
      APP_ROUTES.adminUsers
    );
  });

  it("routes players to the lobby after login", () => {
    expect(getRouteForAuth({ role: "player", status: "authenticated" }, "/login")).toBe(
      APP_ROUTES.lobby
    );
  });

  it("keeps players on the lobby", () => {
    expect(getRouteForAuth({ role: "player", status: "authenticated" }, APP_ROUTES.lobby)).toBe(
      APP_ROUTES.lobby
    );
  });

  it("keeps players on the demo game table", () => {
    expect(getRouteForAuth({ role: "player", status: "authenticated" }, APP_ROUTES.gameDemo)).toBe(
      APP_ROUTES.gameDemo
    );
  });

  it("keeps players on game history", () => {
    expect(
      getRouteForAuth({ role: "player", status: "authenticated" }, APP_ROUTES.gameHistory)
    ).toBe(APP_ROUTES.gameHistory);
  });

  it("prevents players from entering player account management", () => {
    expect(
      getRouteForAuth({ role: "player", status: "authenticated" }, APP_ROUTES.adminUsers)
    ).toBe(APP_ROUTES.lobby);
  });

  it("prevents administrators from entering player game pages", () => {
    expect(getRouteForAuth({ role: "admin", status: "authenticated" }, APP_ROUTES.gameDemo)).toBe(
      APP_ROUTES.adminUsers
    );
    expect(
      getRouteForAuth({ role: "admin", status: "authenticated" }, APP_ROUTES.gameHistory)
    ).toBe(APP_ROUTES.adminUsers);
  });

  it("routes unknown paths to the role default page", () => {
    expect(getRouteForAuth({ role: "player", status: "authenticated" }, "/unknown")).toBe(
      APP_ROUTES.lobby
    );
    expect(getRouteForAuth({ role: "admin", status: "authenticated" }, "/unknown")).toBe(
      APP_ROUTES.adminUsers
    );
  });

  it("dispatches a route change event when replacing the browser path", () => {
    const target = createRouteTarget("/old-path");

    replaceRoute(APP_ROUTES.lobby, target);

    expect(target.location.pathname).toBe(APP_ROUTES.lobby);
    expect(target.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(target.dispatchEvent.mock.calls[0]?.[0].type).toBe(ROUTE_CHANGE_EVENT);
  });

  it("does not dispatch a route change event for the current path", () => {
    const target = createRouteTarget(APP_ROUTES.lobby);

    replaceRoute(APP_ROUTES.lobby, target);

    expect(target.dispatchEvent).not.toHaveBeenCalled();
    expect(target.history.replaceState).not.toHaveBeenCalled();
  });
});
