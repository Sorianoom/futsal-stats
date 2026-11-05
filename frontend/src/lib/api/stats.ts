import { queryCache } from "@/lib/query-cache";

import { apiData } from "./client";
import type { MatchStats, SeasonStats } from "./stats-types";

/** Clave de caché de las estadísticas de un partido (la usa `matchStatsQuery`). */
export function matchStatsKey(matchId: string): string {
  return `stats:match:${matchId}`;
}

/** Clave de caché del acumulado de temporada (la usa `seasonStatsQuery`). */
export const SEASON_STATS_KEY = "stats:season";

/**
 * Tras registrar o corregir eventos, alineación o tramos de un partido sus estadísticas cacheadas
 * dejan de valer, y también el acumulado de temporada, que las suma: se olvidan para que la próxima
 * apertura espere a las nuevas.
 */
export function invalidateMatchStats(matchId: string): void {
  queryCache.invalidate(matchStatsKey(matchId));
  queryCache.invalidate(SEASON_STATS_KEY);
}

export function getMatchStats(matchId: string): Promise<MatchStats> {
  return apiData<MatchStats>(`/matches/${encodeURIComponent(matchId)}/stats`);
}

export function getSeasonStats(): Promise<SeasonStats> {
  return apiData<SeasonStats>("/stats/players");
}
