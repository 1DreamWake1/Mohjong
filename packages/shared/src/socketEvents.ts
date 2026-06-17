import type { Action, GameLobbyRoom, PlayerView } from "./gameTypes.js";

export type ClientToServerEvents = {
  "game:join": (payload: { gameId?: string }) => void;
  "game:start": () => void;
  "game:action": (payload: { action: Action }) => void;
  "game:leave": () => void;
  "game:sync": (payload: { gameId?: string }) => void;
  "lobby:watch": (payload: { roomId: string }) => void;
};

export type ServerToClientEvents = {
  "game:state": (payload: { view: PlayerView }) => void;
  "game:event": (payload: { message: string }) => void;
  "game:error": (payload: { message: string }) => void;
  "game:timeout": (payload: { message: string }) => void;
  "game:ended": (payload: { reason: string }) => void;
  "game:left": (payload: { mode: string; roomId: string }) => void;
  "lobby:room": (payload: { room: GameLobbyRoom }) => void;
};
