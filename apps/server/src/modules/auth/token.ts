import { createHmac, timingSafeEqual } from "node:crypto";

import type { UserRole } from "@mahjong/shared";

export type AuthTokenPayload = {
  exp: number;
  role: UserRole;
  sub: number;
  username: string;
};

type JwtHeader = {
  alg: "HS256";
  typ: "JWT";
};

const TOKEN_TTL_SECONDS = 60 * 60 * 12;
const JWT_HEADER: JwtHeader = {
  alg: "HS256",
  typ: "JWT"
};

function encodeBase64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function isJwtHeader(value: unknown): value is JwtHeader {
  if (!value || typeof value !== "object") {
    return false;
  }

  const header = value as Record<string, unknown>;
  return header.alg === "HS256" && header.typ === "JWT";
}

function isPayload(value: unknown): value is AuthTokenPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return (
    typeof payload.exp === "number" &&
    typeof payload.sub === "number" &&
    typeof payload.username === "string" &&
    (payload.role === "admin" || payload.role === "player")
  );
}

export function createAuthToken(
  input: Omit<AuthTokenPayload, "exp">,
  secret: string
): string {
  const payload: AuthTokenPayload = {
    ...input,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  };
  const encodedHeader = encodeBase64Url(JSON.stringify(JWT_HEADER));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signPayload(signingInput, secret);

  return `${signingInput}.${signature}`;
}

export function verifyAuthToken(
  token: string,
  secret: string
): AuthTokenPayload | null {
  const [encodedHeader, encodedPayload, signature, extra] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature || extra !== undefined) {
    return null;
  }

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = signPayload(signingInput, secret);
  const received = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    return null;
  }

  try {
    const header = JSON.parse(decodeBase64Url(encodedHeader)) as unknown;
    if (!isJwtHeader(header)) {
      return null;
    }

    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as unknown;
    if (!isPayload(payload) || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
