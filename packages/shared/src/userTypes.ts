export type UserRole = "admin" | "player";

export type UserSummary = {
  id: number;
  username: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
};

export type CreatePlayerRequest = {
  username: string;
  password: string;
};

export type PlayerListResponse = {
  players: UserSummary[];
};
