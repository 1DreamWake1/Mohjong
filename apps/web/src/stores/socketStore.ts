import type { Socket } from "socket.io-client";
import { create } from "zustand";

import { createGameSocket } from "../socket/socketClient.js";

type SocketStatus = "idle" | "ready";

type SocketStore = {
  preparedToken: string | null;
  socket: Socket | null;
  status: SocketStatus;
  prepareSocket: (token: string) => void;
  disconnectSocket: () => void;
};

export const useSocketStore = create<SocketStore>((set, get) => ({
  preparedToken: null,
  socket: null,
  status: "idle",

  disconnectSocket: () => {
    get().socket?.disconnect();
    set({ preparedToken: null, socket: null, status: "idle" });
  },

  prepareSocket: (token) => {
    const currentState = get();
    if (currentState.preparedToken === token) {
      return;
    }

    currentState.socket?.disconnect();
    set({
      preparedToken: token,
      socket: createGameSocket(token),
      status: "ready"
    });
  }
}));
