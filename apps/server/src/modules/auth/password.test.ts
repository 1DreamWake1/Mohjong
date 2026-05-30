import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password.js";

describe("password", () => {
  it("hashes and verifies passwords without storing plaintext", async () => {
    const passwordHash = await hashPassword("secret123");

    expect(passwordHash).not.toBe("secret123");
    expect(await verifyPassword("secret123", passwordHash)).toBe(true);
    expect(await verifyPassword("wrong-password", passwordHash)).toBe(false);
  });
});
