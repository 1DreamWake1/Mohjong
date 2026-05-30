import type { UserRole, UserSummary } from "./userTypes.js";

export type LoginRequest = {
  username: string;
  password: string;
};

export type AuthUser = UserSummary & {
  role: UserRole;
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};

export type LogoutResponse = {
  ok: true;
};

export type CurrentUserResponse = {
  user: AuthUser | null;
};
