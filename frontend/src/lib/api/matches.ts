import type { MatchEvent } from "@/lib/match/events";

import { apiData } from "./client";
import type {
  FinalizeResult,
  LineupEventRecord,
  Match,
  NewMatch,
  SyncBatch,
  SyncResult,
} from "./match-types";

export function listMatches(): Promise<Match[]> {
  return apiData<Match[]>("/matches");
}

export function createMatch(match: NewMatch): Promise<Match> {
  return apiData<Match>("/matches", { method: "POST", body: match });
}

export function listMatchEvents(matchId: string): Promise<MatchEvent[]> {
  return apiData<MatchEvent[]>(`/matches/${encodeURIComponent(matchId)}/events`);
}

export function listLineupEvents(matchId: string): Promise<LineupEventRecord[]> {
  return apiData<LineupEventRecord[]>(`/matches/${encodeURIComponent(matchId)}/lineup-events`);
}

/** Envío idempotente: reenviar el mismo lote no duplica nada (los repetidos vuelven en `duplicates`). */
export function syncMatch(matchId: string, batch: SyncBatch): Promise<SyncResult> {
  return apiData<SyncResult>(`/matches/${encodeURIComponent(matchId)}/sync`, { method: "POST", body: batch });
}

export function finalizeMatch(matchId: string, force = false): Promise<FinalizeResult> {
  const query = force ? "?force=true" : "";
  return apiData<FinalizeResult>(`/matches/${encodeURIComponent(matchId)}/finalize${query}`, { method: "POST" });
}
