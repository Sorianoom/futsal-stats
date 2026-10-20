import { apiData } from "./client";
import type { MatchStats } from "./stats-types";

export function getMatchStats(matchId: string): Promise<MatchStats> {
  return apiData<MatchStats>(`/matches/${encodeURIComponent(matchId)}/stats`);
}
