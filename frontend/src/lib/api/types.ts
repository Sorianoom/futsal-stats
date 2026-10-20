export type Role = "head_coach" | "assistant_coach";
export type Position = "field" | "goalkeeper";
export type PlayerStatus = "available" | "injured";

export interface User {
  id: string;
  email: string;
  role: Role;
}

export interface LoginData {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface Player {
  id: string;
  name: string;
  dorsal: number;
  position: Position;
  status: PlayerStatus;
  is_active: boolean;
}

export interface NewPlayer {
  name: string;
  dorsal: number;
  position: Position;
}

export type PlayerChanges = Partial<NewPlayer & { status: PlayerStatus }>;
