import { describe, expect, it } from "vitest";

import { createAuthToken, verifyAuthToken } from "./token.js";

describe("token", () => {
  it("creates a signed JWT shaped token and verifies it", () => {
    const token = createAuthToken(
      {
        role: "admin",
        sub: 1,
        username: "admin"
      },
      "test-secret"
    );

    expect(token.split(".")).toHaveLength(3);
    expect(verifyAuthToken(token, "test-secret")).toMatchObject({
      role: "admin",
      sub: 1,
      username: "admin"
    });
  });

  it("rejects tokens signed with another secret", () => {
    const token = createAuthToken(
      {
        role: "player",
        sub: 2,
        username: "player1"
      },
      "test-secret"
    );

    expect(verifyAuthToken(token, "wrong-secret")).toBeNull();
  });
});
