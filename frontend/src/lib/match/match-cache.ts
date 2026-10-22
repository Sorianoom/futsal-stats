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

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Cuánto hace de la copia, para el aviso de "datos de hace…". */
export function describeAge(elapsedMs: number): string {
  if (elapsedMs < MINUTE_MS) return "menos de 1 min";
  if (elapsedMs < HOUR_MS) return `${Math.floor(elapsedMs / MINUTE_MS)} min`;
  if (elapsedMs < DAY_MS) return `${Math.floor(elapsedMs / HOUR_MS)} h`;
  const days = Math.floor(elapsedMs / DAY_MS);
  return days === 1 ? "1 día" : `${days} días`;
}

export async function loadSnapshot(matchId: string): Promise<MatchSnapshot | null> {
  const stored = await withDb((db) => db.get(STORE, matchId));
  return stored ?? null;
}

// Sube con cada borrado: una escritura pedida antes de borrar no debe resucitar la copia después.
let generation = 0;

/** Se anota al pedir una escritura y se pasa a `saveSnapshot` para que sepa si quedó obsoleta. */
export function snapshotGeneration(): number {
  return generation;
}

/**
 * Sustituye la copia anterior de ese partido. Con `requestedAt` (ver `snapshotGeneration`), si
 * entretanto se borraron las copias, la escritura se descarta.
 */
export async function saveSnapshot(
  matchId: string,
  data: Omit<MatchSnapshot, "savedAt">,
  savedAt: number = Date.now(),
  requestedAt?: number,
): Promise<void> {
  await withDb(async (db) => {
    if (requestedAt !== undefined && requestedAt !== generation) return;
    await db.put(STORE, { ...data, savedAt }, matchId);
  });
}

/** Borra las copias de todos los partidos; no toca lo anotado y sin enviar. */
export async function clearSnapshots(): Promise<void> {
  generation += 1;
  await withDb((db) => db.clear(STORE));
}
