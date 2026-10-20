import { apiData } from "./client";
import type { MatchStats, SeasonStats } from "./stats-types";

export function getMatchStats(matchId: string): Promise<MatchStats> {
  return apiData<MatchStats>(`/matches/${encodeURIComponent(matchId)}/stats`);
}

export function getSeasonStats(): Promise<SeasonStats> {
  return apiData<SeasonStats>("/stats/players");
}
