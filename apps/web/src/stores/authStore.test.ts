import type { AuthUser } from "@mahjong/shared";
import type { Socket } from "socket.io-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/client.js", () => ({
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn()
}));

import { getCurrentUser, login, logout } from "../api/client.js";
import { useAuthStore } from "./authStore.js";
import { useSocketStore } from "./socketStore.js";

const adminUser: AuthUser = {
  createdAt: "2026-05-30T00:00:00.000Z",
  id: 1,
  role: "admin",
  updatedAt: "2026-05-30T00:00:00.000Z",
  username: "admin"
};

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    }
  };
}

const storage = createMemoryStorage();
const disconnectSocket = vi.fn();

function createSocketMock(): Socket {
  return { disconnect: disconnectSocket } as unknown as Socket;
}

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: storage
});

describe("authStore", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    useAuthStore.setState({
      status: "checking",
      token: null,
      user: null
    });
    useSocketStore.setState({
      preparedToken: null,
      socket: null,
      status: "idle"
    });
  });

  it("restores anonymous state when the cookie session is absent", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new Error("no cookie"));
    await useAuthStore.getState().restoreSession();

    expect(useAuthStore.getState()).toMatchObject({
      status: "anonymous",
      token: null,
      user: null
    });
    expect(getCurrentUser).toHaveBeenCalledWith();
  });

  it("restores authenticated state from the HttpOnly cookie", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);

    await useAuthStore.getState().restoreSession();

    expect(getCurrentUser).toHaveBeenCalledWith();
    expect(useAuthStore.getState()).toMatchObject({
      status: "authenticated",
      token: "cookie-session",
      user: adminUser
    });
  });

  it("stores the cookie session marker and user after sign in", async () => {
    vi.mocked(login).mockResolvedValue({
      token: "next-token",
      user: adminUser
    });
    useSocketStore.setState({
      preparedToken: "previous-token",
      socket: createSocketMock(),
      status: "ready"
    });

    await useAuthStore.getState().signIn({ password: "admin123", username: "admin" });

    expect(disconnectSocket).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("mahjong.authToken")).toBeNull();
    expect(useAuthStore.getState()).toMatchObject({
      status: "authenticated",
      token: "cookie-session",
      user: adminUser
    });
  });

  it("clears token and user after sign out", async () => {
    vi.mocked(logout).mockResolvedValue({ ok: true });
    useAuthStore.setState({
      status: "authenticated",
      token: "cookie-session",
      user: adminUser
    });
    useSocketStore.setState({
      preparedToken: "cookie-session",
      socket: createSocketMock(),
      status: "ready"
    });

    await useAuthStore.getState().signOut();

    expect(logout).toHaveBeenCalledWith("cookie-session");
    expect(disconnectSocket).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("mahjong.authToken")).toBeNull();
    expect(useAuthStore.getState()).toMatchObject({
      status: "anonymous",
      token: null,
      user: null
    });
    expect(useSocketStore.getState()).toMatchObject({
      preparedToken: null,
      socket: null,
      status: "idle"
    });
  });

  it("clears socket state when restoring with an invalid token", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new Error("invalid token"));
    useSocketStore.setState({
      preparedToken: "cookie-session",
      socket: createSocketMock(),
      status: "ready"
    });

    await useAuthStore.getState().restoreSession();

    expect(disconnectSocket).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("mahjong.authToken")).toBeNull();
    expect(useAuthStore.getState()).toMatchObject({
      status: "anonymous",
      token: null,
      user: null
    });
    expect(useSocketStore.getState()).toMatchObject({
      preparedToken: null,
      socket: null,
      status: "idle"
    });
  });
});
