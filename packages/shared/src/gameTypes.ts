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

export type GamePhase =
  | "waiting"
  | "dealing"
  | "exchange-three"
  | "choose-missing-suit"
  | "playing"
  | "ended";

export type PlayerActionType =
  | "discard"
  | "chi"
  | "peng"
  | "gang"
  | "hu"
  | "pass"
  | "exchangeThree"
  | "chooseMissingSuit";

export type Action = {
  type: PlayerActionType;
  tileId?: string;
  tileIds?: string[];
  suit?: TileSuit;
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

export type GameWinnerResult = GameResultInfo & {
  winnerSeatIndex: number;
};

export type GameReadyResult = {
  maxFanTotal: number;
  maxPoints: number;
  seatIndex: number;
  waitingTiles: TileInfo[];
};

export type GameRecordStatus = "playing" | "ended";
export type GameRecordEndReason = "hu" | "draw" | "abnormal";

export type GameLobbyRoomStatus = "waiting" | "playing" | "ended";

export type GameLobbySeat = {
  seatIndex: number;
  userId?: number;
  username?: string;
  isBot: boolean;
  isReady: boolean;
};

export type GameLobbyRoom = {
  roomId: string;
  ownerUserId: number;
  ruleName?: "simple" | "standard" | "sichuan";
  ruleVersion?: number;
  status: GameLobbyRoomStatus;
  seats: GameLobbySeat[];
  createdAt: string;
  updatedAt: string;
};

export type CreateGameRoomRequest = {
  ruleName?: "simple" | "standard" | "sichuan";
};

export type CreateGameRoomResponse = {
  room: GameLobbyRoom;
};

export type GetCurrentGameRoomResponse = {
  room: GameLobbyRoom | null;
};

export type JoinGameRoomResponse = {
  room: GameLobbyRoom;
};

export type LeaveGameRoomResponse = {
  room: GameLobbyRoom | null;
};

export type SetGameRoomReadyRequest = {
  isReady: boolean;
};

export type SetGameRoomReadyResponse = {
  room: GameLobbyRoom;
};

export type StartGameRoomResponse = {
  room: GameLobbyRoom;
};

export type ResetGameRoomResponse = {
  room: GameLobbyRoom;
};

export type GameHistoryItem = {
  roomId: string;
  ruleName: string;
  ruleVersion?: number;
  status: GameRecordStatus;
  startedAt: string;
  endedAt?: string;
  endReason?: GameRecordEndReason;
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
  gangScores?: [number, number, number, number];
  readyResults?: GameReadyResult[];
  totalPoints: number;
  winnerSeatIndex?: number;
  winningTile?: TileInfo;
  winType?: WinType;
  winnerResults?: GameWinnerResult[];
};

export type GameHistoryEvent = GameEventMessage & {
  viewSnapshot?: PlayerView;
};

export type GameHistoryDetail = GameHistoryItem & {
  events: GameHistoryEvent[];
  result?: GameHistoryResultSnapshot;
};

export type AdminGameHistoryItem = GameHistoryItem & {
  playerUserId?: number;
  playerUsername?: string;
};

export type AdminGameHistoryDetail = AdminGameHistoryItem & {
  events: GameHistoryEvent[];
  result?: GameHistoryResultSnapshot;
};

export type ListGameHistoryResponse = {
  records: GameHistoryItem[];
};

export type GetGameHistoryResponse = {
  record: GameHistoryDetail;
};

export type ListAdminGameRecordsResponse = {
  records: AdminGameHistoryItem[];
};

export type GetAdminGameRecordResponse = {
  record: AdminGameHistoryDetail;
};

export type AdminActiveRoomSeat = GameLobbySeat & {
  connectionStatus: "bot" | "disconnected" | "empty" | "online";
};

export type AdminActiveRoom = Omit<GameLobbyRoom, "seats"> & {
  seats: AdminActiveRoomSeat[];
};

export type ListAdminActiveRoomsResponse = {
  rooms: AdminActiveRoom[];
};

export type PersistenceDiagnosticOperation =
  | "append-event"
  | "create-record"
  | "finish-record"
  | "save-recovery-snapshot";

export type AdminPersistenceDiagnostic = {
  createdAt: string;
  id: string;
  message: string;
  operation: PersistenceDiagnosticOperation;
  roomId: string;
};

export type ListAdminPersistenceDiagnosticsResponse = {
  diagnostics: AdminPersistenceDiagnostic[];
};

export type OtherPlayerView = {
  gangPoints?: number;
  seatIndex: number;
  username: string;
  handTileCount: number;
  isBot: boolean;
  hasWon?: boolean;
};

export type TurnTimerInfo = { mode: "countdown"; deadlineAt: string } | { mode: "unlimited" };

export type PlayerView = {
  roomId: string;
  seatIndex: number;
  username: string;
  handTiles: TileInfo[];
  gangPoints?: number;
  lastDrawnTileId?: string;
  lastDiscardedTileId?: string;
  otherPlayers: OtherPlayerView[];
  discardAreas: DiscardPile[];
  publicMelds: MeldInfo[];
  currentTurn: number;
  availableActions: Action[];
  phase: GamePhase;
  hasWon?: boolean;
  missingSuit?: Extract<TileSuit, "bamboo" | "characters" | "dots">;
  wallTileCount: number;
  eventMessages: GameEventMessage[];
  turnTimer?: TurnTimerInfo;
  result?: GameResultInfo;
  readyResults?: GameReadyResult[];
  waitingTiles?: TileInfo[];
  winnerResults?: GameWinnerResult[];
  winnerSeatIndex?: number;
};
