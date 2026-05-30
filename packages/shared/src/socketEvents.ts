import type { Action, PlayerView } from "./gameTypes.js";

export type ClientToServerEvents = {
  "game:join": (payload: { gameId?: string }) => void;
  "game:start": () => void;
  "game:action": (payload: { action: Action }) => void;
  "game:sync": (payload: { gameId: string }) => void;
};

export type ServerToClientEvents = {
  "game:state": (payload: { view: PlayerView }) => void;
  "game:event": (payload: { message: string }) => void;
  "game:error": (payload: { message: string }) => void;
  "game:ended": (payload: { reason: string }) => void;
};
