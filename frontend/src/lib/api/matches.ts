import { apiData } from "./client";
import type {
  FinalizeResult,
  LineupEventRecord,
  LoggedEvent,
  Match,
  NewMatch,
  StintRecord,
  SyncBatch,
  SyncResult,
} from "./match-types";
import { invalidateMatchStats } from "./stats";

export function listMatches(): Promise<Match[]> {
  return apiData<Match[]>("/matches");
}

export function createMatch(match: NewMatch, idempotencyKey?: string): Promise<Match> {
  return apiData<Match>("/matches", { method: "POST", body: match, idempotencyKey });
}

export function listMatchEvents(matchId: string): Promise<LoggedEvent[]> {
  return apiData<LoggedEvent[]>(`/matches/${encodeURIComponent(matchId)}/events`);
}

export function listLineupEvents(matchId: string): Promise<LineupEventRecord[]> {
  return apiData<LineupEventRecord[]>(`/matches/${encodeURIComponent(matchId)}/lineup-events`);
}

export function listStints(matchId: string): Promise<StintRecord[]> {
  return apiData<StintRecord[]>(`/matches/${encodeURIComponent(matchId)}/stints`);
}

/**
 * Envío idempotente: reenviar el mismo lote no duplica nada (los repetidos vuelven en `duplicates`).
 * Haya ido bien o no, se olvidan las estadísticas cacheadas: un corte de red puede llegar después
 * de que el servidor haya aplicado el lote.
 */
export function syncMatch(matchId: string, batch: SyncBatch): Promise<SyncResult> {
  return apiData<SyncResult>(`/matches/${encodeURIComponent(matchId)}/sync`, {
    method: "POST",
    body: batch,
  }).finally(() => invalidateMatchStats(matchId));
}

export function finalizeMatch(matchId: string, force = false): Promise<FinalizeResult> {
  const query = force ? "?force=true" : "";
  return apiData<FinalizeResult>(`/matches/${encodeURIComponent(matchId)}/finalize${query}`, {
    method: "POST",
  }).finally(() => invalidateMatchStats(matchId));
}
