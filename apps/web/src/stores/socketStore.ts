import { create } from "zustand";

import { createGameSocket, type GameSocket } from "../socket/socketClient.js";

type SocketStatus = "idle" | "ready" | "connected";

type SocketStore = {
  preparedToken: string | null;
  socket: GameSocket | null;
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
    const socket = createGameSocket(token);
    socket.on("connect", () => {
      set({ status: "connected" });
    });
    socket.on("disconnect", () => {
      if (get().socket === socket) {
        set({ status: "ready" });
      }
    });

    set({
      preparedToken: token,
      socket,
      status: "ready"
    });
  }
}));
