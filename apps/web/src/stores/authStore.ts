import type { AuthUser, LoginRequest } from "@mahjong/shared";
import { create } from "zustand";

import { getCurrentUser, login, logout } from "../api/client.js";
import { useSocketStore } from "./socketStore.js";

const TOKEN_STORAGE_KEY = "mahjong.authToken";

type AuthStatus = "checking" | "anonymous" | "authenticated";

type AuthStore = {
  status: AuthStatus;
  token: string | null;
  user: AuthUser | null;
  restoreSession: () => Promise<void>;
  signIn: (input: LoginRequest) => Promise<void>;
  signOut: () => Promise<void>;
  clearSession: () => void;
};

function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

function storeToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

function clearClientSession(): void {
  clearStoredToken();
  useSocketStore.getState().disconnectSocket();
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  status: "checking",
  token: null,
  user: null,

  clearSession: () => {
    clearClientSession();
    set({ status: "anonymous", token: null, user: null });
  },

  restoreSession: async () => {
    const token = getStoredToken();
    if (!token) {
      set({ status: "anonymous", token: null, user: null });
      return;
    }

    try {
      const user = await getCurrentUser(token);
      set({ status: "authenticated", token, user });
    } catch {
      clearClientSession();
      set({ status: "anonymous", token: null, user: null });
    }
  },

  signIn: async (input) => {
    const response = await login(input);
    useSocketStore.getState().disconnectSocket();
    storeToken(response.token);
    set({
      status: "authenticated",
      token: response.token,
      user: response.user
    });
  },

  signOut: async () => {
    const token = get().token;
    if (token) {
      try {
        await logout(token);
      } catch {
        // Local token removal is the source of truth for stateless logout.
      }
    }

    clearClientSession();
    set({ status: "anonymous", token: null, user: null });
  }
}));
