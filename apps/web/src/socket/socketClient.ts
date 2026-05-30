import { io, type Socket } from "socket.io-client";

import { API_BASE_URL } from "../api/client.js";

export function createGameSocket(token: string): Socket {
  return io(API_BASE_URL, {
    auth: { token },
    autoConnect: false,
    transports: ["websocket", "polling"]
  });
}
