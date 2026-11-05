import { queryCache } from "@/lib/query-cache";

import { apiData } from "./client";
import type { MatchStats, SeasonStats } from "./stats-types";

/** Clave de caché de las estadísticas de un partido (la usa `matchStatsQuery`). */
export function matchStatsKey(matchId: string): string {
  return `stats:match:${matchId}`;
}

/**
 * Tras registrar o corregir eventos, alineación o tramos de un partido sus estadísticas cacheadas
 * dejan de valer: se olvidan para que la próxima apertura del detalle espere a las nuevas.
 */
export function invalidateMatchStats(matchId: string): void {
  queryCache.invalidate(matchStatsKey(matchId));
}

export function getMatchStats(matchId: string): Promise<MatchStats> {
  return apiData<MatchStats>(`/matches/${encodeURIComponent(matchId)}/stats`);
}

export function getSeasonStats(): Promise<SeasonStats> {
  return apiData<SeasonStats>("/stats/players");
}
