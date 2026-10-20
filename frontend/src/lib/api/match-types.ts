import type { EventKind, MatchEvent } from "@/lib/match/events";
import type { LineupEvent } from "@/lib/match/lineup";

export interface Match {
  id: string;
  session_id: string;
  held_on: string;
  opponent: string;
}

export interface NewMatch {
  held_on: string;
  opponent: string;
}

/** Evento de alineación tal y como lo guarda y lo devuelve la API. */
export interface LineupEventRecord {
  id: string;
  seq: number;
  payload: LineupEvent;
}

/** Evento del partido con su número de secuencia, tal y como lo devuelve la API. */
export type LoggedEvent = MatchEvent & { seq: number };

export interface EventIn {
  id: string;
  seq: number;
  kind: EventKind;
  part: number;
  t: number;
  player_id?: string | null;
  voids_event_id?: string | null;
}

export interface RatingIn {
  id: string;
  part: number;
  t: number;
  stars: number;
}

export interface SyncBatch {
  events?: EventIn[];
  lineup_events?: LineupEventRecord[];
  ratings?: RatingIn[];
}

export interface SyncResult {
  accepted: string[];
  duplicates: string[];
  rejected: { id: string; reason: string }[];
}

export interface StintRecord {
  id: string;
  match_id: string;
  player_id: string;
  part: number;
  start_s: number;
  end_s: number;
}

export interface FinalizeResult {
  stints: StintRecord[];
  seconds_by_player: Record<string, number>;
}
