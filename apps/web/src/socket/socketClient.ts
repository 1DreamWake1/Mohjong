import type { ClientToServerEvents, ServerToClientEvents } from "@mahjong/shared";
import { io, type Socket } from "socket.io-client";

import { API_BASE_URL } from "../api/client.js";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createGameSocket(token?: string): GameSocket {
  return io(API_BASE_URL, {
    auth: token && token !== "cookie-session" ? { token } : {},
    autoConnect: false,
    transports: ["websocket", "polling"]
  }) as GameSocket;
}
