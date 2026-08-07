import type { AuthUser, LoginRequest } from "@mahjong/shared";
import { create } from "zustand";

import { getCurrentUser, login, logout } from "../api/client.js";
import { useSocketStore } from "./socketStore.js";

const COOKIE_SESSION_TOKEN = "cookie-session";

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

function clearClientSession(): void {
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
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("No active cookie session");
      set({ status: "authenticated", token: COOKIE_SESSION_TOKEN, user });
    } catch {
      clearClientSession();
      set({ status: "anonymous", token: null, user: null });
    }
  },

  signIn: async (input) => {
    const response = await login(input);
    useSocketStore.getState().disconnectSocket();
    set({
      status: "authenticated",
      token: COOKIE_SESSION_TOKEN,
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
