import { describe, expect, it } from "vitest";

import { createAuthToken, verifyAuthToken } from "./token.js";

const SECRET = "test-secret-that-is-long-enough-for-signing";

describe("token", () => {
  it("creates a signed JWT shaped token and verifies it", () => {
    const token = createAuthToken(
      {
        role: "admin",
        sub: 1,
        username: "admin"
      },
      SECRET
    );

    expect(token.split(".")).toHaveLength(3);
    expect(verifyAuthToken(token, SECRET)).toMatchObject({
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
      SECRET
    );

    expect(verifyAuthToken(token, "wrong-secret")).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyAuthToken("", SECRET)).toBeNull();
    expect(verifyAuthToken("not-a-jwt", SECRET)).toBeNull();
    expect(verifyAuthToken("a.b", SECRET)).toBeNull();
    expect(verifyAuthToken("a.b.c.d", SECRET)).toBeNull();
  });

  it("rejects tokens with an invalid header", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: "player",
        sub: 1,
        username: "player1"
      })
    ).toString("base64url");
    const signingInput = `${header}.${payload}`;
    const signature = Buffer.from(signingInput, "utf8").toString("base64url");

    expect(verifyAuthToken(`${signingInput}.${signature}`, SECRET)).toBeNull();
  });

  it("rejects expired tokens", () => {
    const expired = createAuthToken(
      {
        role: "player",
        sub: 1,
        username: "player1"
      },
      SECRET
    );

    // 构造一个已经过期的同结构 token。
    const [header, payload] = expired.split(".");
    const expiredPayload = Buffer.from(
      JSON.stringify({
        ...(JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")) as object),
        exp: Math.floor(Date.now() / 1000) - 100
      })
    ).toString("base64url");
    const signingInput = `${header}.${expiredPayload}`;
    const signature = Buffer.from(signingInput, "utf8").toString("base64url");

    expect(verifyAuthToken(`${signingInput}.${signature}`, SECRET)).toBeNull();
  });

  it("rejects tampered payloads", () => {
    const token = createAuthToken(
      {
        role: "player",
        sub: 1,
        username: "player1"
      },
      SECRET
    );

    const [header, payload, signature] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")) as {
      role: string;
    };
    const tampered = Buffer.from(JSON.stringify({ ...decoded, role: "admin" })).toString(
      "base64url"
    );

    expect(verifyAuthToken(`${header}.${tampered}.${signature}`, SECRET)).toBeNull();
  });

  it("rejects invalid base64 payloads", () => {
    const token = createAuthToken(
      {
        role: "player",
        sub: 1,
        username: "player1"
      },
      SECRET
    );
    const [header, , signature] = token.split(".");

    expect(verifyAuthToken(`${header}.not-valid-base64!!.${signature}`, SECRET)).toBeNull();
    expect(verifyAuthToken(`${header}.${signature}`, SECRET)).toBeNull();
  });

  it("rejects unsigned tokens", () => {
    const token = createAuthToken(
      {
        role: "player",
        sub: 1,
        username: "player1"
      },
      SECRET
    );
    const [header, payload] = token.split(".");

    expect(verifyAuthToken(`${header}.${payload}`, SECRET)).toBeNull();
  });
});
