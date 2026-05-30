import { describe, expect, it } from "vitest";

import { APP_ROUTES, getRouteForAuth } from "./routes.js";

describe("app routes", () => {
  it("does not redirect while restoring authentication", () => {
    expect(getRouteForAuth({ status: "checking" })).toBeNull();
  });

  it("routes anonymous users to login", () => {
    expect(getRouteForAuth({ status: "anonymous" })).toBe(APP_ROUTES.login);
  });

  it("routes administrators to player account management", () => {
    expect(getRouteForAuth({ role: "admin", status: "authenticated" })).toBe(
      APP_ROUTES.adminUsers
    );
  });

  it("routes players to the lobby", () => {
    expect(getRouteForAuth({ role: "player", status: "authenticated" })).toBe(
      APP_ROUTES.lobby
    );
  });
});
