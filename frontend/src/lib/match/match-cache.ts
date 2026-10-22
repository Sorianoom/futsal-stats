import type { LineupEventRecord, LoggedEvent, Match, StintRecord } from "@/lib/api/match-types";
import type { Player } from "@/lib/api/types";

import { SNAPSHOT_STORE as STORE, withDb } from "./local-db";

/** Lo que el servidor dijo del partido la última vez que se pudo cargar, para abrirlo sin red. */
export interface MatchSnapshot {
  match: Match;
  lineup: LineupEventRecord[];
  events: LoggedEvent[];
  stints: StintRecord[];
  players: Player[];
  proposed: string[];
  /** Milisegundos desde 1970 en que se guardó. */
  savedAt: number;
}

export async function loadSnapshot(matchId: string): Promise<MatchSnapshot | null> {
  const stored = await withDb((db) => db.get(STORE, matchId));
  return stored ?? null;
}

/** Sustituye la copia anterior de ese partido. */
export async function saveSnapshot(
  matchId: string,
  data: Omit<MatchSnapshot, "savedAt">,
  savedAt: number = Date.now(),
): Promise<void> {
  await withDb((db) => db.put(STORE, { ...data, savedAt }, matchId));
}

/** Borra las copias de todos los partidos; no toca lo anotado y sin enviar. */
export async function clearSnapshots(): Promise<void> {
  await withDb((db) => db.clear(STORE));
}
