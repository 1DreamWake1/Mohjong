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
  tileIds?: string[];
};

export type GameEventMessage = {
  id: string;
  text: string;
  createdAt: string;
};

export type GameScoreFan = {
  name: string;
  value: number;
};

export type WinType = "selfDraw" | "discard";

export type GameResultInfo = {
  endReason: "hu" | "draw";
  fans: GameScoreFan[];
  fanTotal: number;
  totalPoints: number;
  winType?: WinType;
  winningTile?: TileInfo;
};

export type GameRecordStatus = "playing" | "ended";

export type GameHistoryItem = {
  roomId: string;
  ruleName: string;
  status: GameRecordStatus;
  startedAt: string;
  endedAt?: string;
  endReason?: "hu" | "draw";
  winnerSeatIndex?: number;
  winType?: WinType;
  winningTile?: string;
  fanTotal?: number;
  totalPoints?: number;
};

export type GameHistoryResultSnapshot = {
  endReason?: "hu" | "draw";
  fanTotal: number;
  fans: GameScoreFan[];
  totalPoints: number;
  winnerSeatIndex?: number;
  winningTile?: TileInfo;
  winType?: WinType;
};

export type GameHistoryDetail = GameHistoryItem & {
  events: GameEventMessage[];
  result?: GameHistoryResultSnapshot;
};

export type ListGameHistoryResponse = {
  records: GameHistoryItem[];
};

export type GetGameHistoryResponse = {
  record: GameHistoryDetail;
};

export type OtherPlayerView = {
  seatIndex: number;
  username: string;
  handTileCount: number;
  isBot: boolean;
};

export type PlayerView = {
  roomId: string;
  seatIndex: number;
  username: string;
  handTiles: TileInfo[];
  lastDrawnTileId?: string;
  lastDiscardedTileId?: string;
  otherPlayers: OtherPlayerView[];
  discardAreas: DiscardPile[];
  publicMelds: MeldInfo[];
  currentTurn: number;
  availableActions: Action[];
  phase: GamePhase;
  wallTileCount: number;
  eventMessages: GameEventMessage[];
  result?: GameResultInfo;
  winnerSeatIndex?: number;
};
