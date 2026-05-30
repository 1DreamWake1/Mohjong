export type TileSuit = "characters" | "dots" | "bamboo" | "winds" | "dragons";

export type TileInfo = {
  id: string;
  suit: TileSuit;
  rank: number;
  label: string;
};

export type MeldType = "chi" | "peng" | "gang";

export type MeldInfo = {
  type: MeldType;
  ownerSeatIndex: number;
  tiles: TileInfo[];
  fromSeatIndex?: number;
};

export type DiscardPile = {
  seatIndex: number;
  tiles: TileInfo[];
};

export type GamePhase = "waiting" | "dealing" | "playing" | "ended";

export type PlayerActionType = "discard" | "chi" | "peng" | "gang" | "hu" | "pass";

export type Action = {
  type: PlayerActionType;
  tileId?: string;
};

export type OtherPlayerView = {
  seatIndex: number;
  username: string;
  handTileCount: number;
  isBot: boolean;
};

export type PlayerView = {
  seatIndex: number;
  handTiles: TileInfo[];
  otherPlayers: OtherPlayerView[];
  discardAreas: DiscardPile[];
  publicMelds: MeldInfo[];
  currentTurn: number;
  availableActions: Action[];
  phase: GamePhase;
};
