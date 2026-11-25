import type { GoalDetail } from "@/lib/match/goal-detail";
import { queryCache } from "@/lib/query-cache";

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
import { invalidateFantasy } from "./fantasy";
import { invalidateMatchStats } from "./stats";

/** Clave de caché de la lista de partidos (la usa `matchesQuery`). */
export const MATCHES_KEY = "/matches";

export function listMatches(): Promise<Match[]> {
  return apiData<Match[]>("/matches");
}

export function createMatch(match: NewMatch, idempotencyKey?: string): Promise<Match> {
  return apiData<Match>("/matches", { method: "POST", body: match, idempotencyKey });
}

/**
 * Marca un partido como oficial o amistoso (personal técnico). Cambia qué jornadas tiene el
 * Fantasy, así que haya ido bien o no se olvidan la lista de partidos y lo cacheado del Fantasy.
 */
export function setMatchOfficial(matchId: string, isOfficial: boolean): Promise<Match> {
  return apiData<Match>(`/matches/${encodeURIComponent(matchId)}`, {
    method: "PATCH",
    body: { is_official: isOfficial },
  }).finally(() => {
    queryCache.invalidate(MATCHES_KEY);
    invalidateFantasy();
  });
}

export function listMatchEvents(matchId: string): Promise<LoggedEvent[]> {
  return apiData<LoggedEvent[]>(`/matches/${encodeURIComponent(matchId)}/events`);
}

/** Pone o cambia el tipo y el punto de un gol ya anotado (al corregir el partido). */
export function setGoalDetail(matchId: string, eventId: string, detail: GoalDetail): Promise<LoggedEvent> {
  return apiData<LoggedEvent>(
    `/matches/${encodeURIComponent(matchId)}/events/${encodeURIComponent(eventId)}/goal-detail`,
    { method: "PUT", body: detail },
  ).finally(() => invalidateMatchStats(matchId));
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
export function syncMatch(
  matchId: string,
  batch: SyncBatch,
  options: { signal?: AbortSignal } = {},
): Promise<SyncResult> {
  return apiData<SyncResult>(`/matches/${encodeURIComponent(matchId)}/sync`, {
    method: "POST",
    body: batch,
    signal: options.signal,
  }).finally(() => invalidateMatchStats(matchId));
}

export function finalizeMatch(matchId: string, force = false): Promise<FinalizeResult> {
  const query = force ? "?force=true" : "";
  return apiData<FinalizeResult>(`/matches/${encodeURIComponent(matchId)}/finalize${query}`, {
    method: "POST",
  }).finally(() => invalidateMatchStats(matchId));
}

/**
 * Pasa todo lo anotado de un jugador a otro en el partido (se apuntó a uno por otro). El
 * destino no puede tener nada en el partido.
 */
export function transferPlayer(matchId: string, fromPlayerId: string, toPlayerId: string): Promise<{ changed: number }> {
  return apiData<{ changed: number }>(`/matches/${encodeURIComponent(matchId)}/player-transfer`, {
    method: "POST",
    body: { from_player_id: fromPlayerId, to_player_id: toPlayerId },
  }).finally(() => {
    invalidateMatchStats(matchId);
    invalidateFantasy();
  });
}

/** Borra todas las estadísticas del partido (eventos, alineación, valoraciones y minutos). */
export function clearMatchStats(matchId: string): Promise<{ changed: number }> {
  return apiData<{ changed: number }>(`/matches/${encodeURIComponent(matchId)}/stats`, {
    method: "DELETE",
  }).finally(() => {
    invalidateMatchStats(matchId);
    invalidateFantasy();
  });
}

/** Elige (o quita, con null) el MVP del partido: suma puntos en el Fantasy. */
export function setMatchMvp(matchId: string, playerId: string | null): Promise<Match> {
  return apiData<Match>(`/matches/${encodeURIComponent(matchId)}/mvp`, {
    method: "PUT",
    body: { player_id: playerId },
  }).finally(() => {
    queryCache.invalidate(MATCHES_KEY);
    invalidateFantasy();
  });
}
