import { describe, expect, it } from "vitest";

import { APP_ROUTES, getRouteForAuth } from "./routes.js";

describe("app routes", () => {
  it("does not redirect while restoring authentication", () => {
    expect(getRouteForAuth({ status: "checking" })).toBeNull();
  });

  it("routes anonymous users to login", () => {
    expect(getRouteForAuth({ status: "anonymous" }, APP_ROUTES.lobby)).toBe(
      APP_ROUTES.login
    );
  });

  it("routes administrators to player account management", () => {
    expect(
      getRouteForAuth({ role: "admin", status: "authenticated" }, "/login")
    ).toBe(APP_ROUTES.adminUsers);
  });

  it("keeps administrators on player account management", () => {
    expect(
      getRouteForAuth(
        { role: "admin", status: "authenticated" },
        APP_ROUTES.adminUsers
      )
    ).toBe(APP_ROUTES.adminUsers);
  });

  it("prevents administrators from entering the player lobby", () => {
    expect(
      getRouteForAuth(
        { role: "admin", status: "authenticated" },
        APP_ROUTES.lobby
      )
    ).toBe(APP_ROUTES.adminUsers);
  });

  it("routes players to the lobby after login", () => {
    expect(
      getRouteForAuth({ role: "player", status: "authenticated" }, "/login")
    ).toBe(APP_ROUTES.lobby);
  });

  it("keeps players on the lobby", () => {
    expect(
      getRouteForAuth(
        { role: "player", status: "authenticated" },
        APP_ROUTES.lobby
      )
    ).toBe(APP_ROUTES.lobby);
  });

  it("prevents players from entering player account management", () => {
    expect(
      getRouteForAuth(
        { role: "player", status: "authenticated" },
        APP_ROUTES.adminUsers
      )
    ).toBe(APP_ROUTES.lobby);
  });

  it("routes unknown paths to the role default page", () => {
    expect(
      getRouteForAuth(
        { role: "player", status: "authenticated" },
        "/unknown"
      )
    ).toBe(APP_ROUTES.lobby);
    expect(
      getRouteForAuth({ role: "admin", status: "authenticated" }, "/unknown")
    ).toBe(APP_ROUTES.adminUsers);
  });
});
