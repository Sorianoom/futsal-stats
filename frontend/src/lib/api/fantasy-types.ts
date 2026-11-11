/** Tipos del Fantasy tal y como los devuelve la API. El dinero va en miles: 1000 = 1 M. */
import type { Position } from "./types";

export interface FantasyLeague {
  id: string;
  starts_on: string;
}

export interface CreatedLeague extends FantasyLeague {
  participants: number;
}

export interface FantasyParticipant {
  participant_id: string;
  display_name: string;
  balance: number;
}

/** Copia de un jugador real en mi plantilla. */
export interface SquadCopy {
  copy_id: string;
  player_id: string;
  name: string;
  dorsal: number;
  position: Position;
  value: number;
}

/** 1 portero y 4 de campo; null es un hueco vacío, que puntúa 0. */
export interface FantasyLineup {
  goalkeeper_copy_id: string | null;
  field_copy_ids: (string | null)[];
}

export interface NextRound {
  match_id: string;
  opponent: string;
  held_on: string;
  /** Momento ISO en que se bloquea la alineación (00:00 en Madrid del día del partido). */
  locks_at: string;
}

export interface FantasyLeagueView {
  league: FantasyLeague;
  me: FantasyParticipant;
  squad: SquadCopy[];
  lineup: FantasyLineup;
  next_round: NextRound | null;
}

export type FantasyMe = { league: null } | FantasyLeagueView;

export type RoundStatus = "scored" | "pending";

export interface StandingsRound {
  match_id: string;
  opponent: string;
  held_on: string;
  status: RoundStatus;
}

export interface StandingsRow {
  participant_id: string;
  display_name: string;
  total: number;
  points_by_round: Record<string, number>;
}

export interface FantasyStandings {
  rounds: StandingsRound[];
  /** Ya ordenadas por el servidor. */
  rows: StandingsRow[];
}

export interface RoundSlot {
  slot: Position;
  copy_id: string | null;
  player_id: string | null;
  name: string | null;
  rating: number | null;
  goals: number;
  points: number;
}

export interface FantasyRound {
  match_id: string;
  status: RoundStatus;
  total: number;
  slots: RoundSlot[];
}
