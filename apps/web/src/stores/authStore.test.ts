import type { AuthUser } from "@mahjong/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/client.js", () => ({
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn()
}));

import { getCurrentUser, login, logout } from "../api/client.js";
import { useAuthStore } from "./authStore.js";

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
  });

  it("restores anonymous state when no token is stored", async () => {
    await useAuthStore.getState().restoreSession();

    expect(useAuthStore.getState()).toMatchObject({
      status: "anonymous",
      token: null,
      user: null
    });
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it("restores authenticated state from a stored token", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    localStorage.setItem("mahjong.authToken", "stored-token");

    await useAuthStore.getState().restoreSession();

    expect(getCurrentUser).toHaveBeenCalledWith("stored-token");
    expect(useAuthStore.getState()).toMatchObject({
      status: "authenticated",
      token: "stored-token",
      user: adminUser
    });
  });

  it("stores token and user after sign in", async () => {
    vi.mocked(login).mockResolvedValue({
      token: "next-token",
      user: adminUser
    });

    await useAuthStore
      .getState()
      .signIn({ password: "admin123", username: "admin" });

    expect(localStorage.getItem("mahjong.authToken")).toBe("next-token");
    expect(useAuthStore.getState()).toMatchObject({
      status: "authenticated",
      token: "next-token",
      user: adminUser
    });
  });

  it("clears token and user after sign out", async () => {
    vi.mocked(logout).mockResolvedValue({ ok: true });
    localStorage.setItem("mahjong.authToken", "current-token");
    useAuthStore.setState({
      status: "authenticated",
      token: "current-token",
      user: adminUser
    });

    await useAuthStore.getState().signOut();

    expect(logout).toHaveBeenCalledWith("current-token");
    expect(localStorage.getItem("mahjong.authToken")).toBeNull();
    expect(useAuthStore.getState()).toMatchObject({
      status: "anonymous",
      token: null,
      user: null
    });
  });
});
