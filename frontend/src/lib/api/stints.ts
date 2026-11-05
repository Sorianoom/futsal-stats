import { apiData } from "./client";
import type { StintRecord } from "./match-types";
import { invalidateMatchStats } from "./stats";

/** Un tramo cambia los minutos y quintetos de su partido: sus estadísticas cacheadas ya no valen. */
function forgetStatsOf(stint: StintRecord): StintRecord {
  if (stint.match_id) invalidateMatchStats(stint.match_id);
  return stint;
}

export interface NewStint {
  player_id: string;
  part: number;
  start_s: number;
  end_s: number;
}

export type StintChanges = Partial<Pick<NewStint, "part" | "start_s" | "end_s">>;

export function createStint(matchId: string, stint: NewStint): Promise<StintRecord> {
  return apiData<StintRecord>(`/matches/${encodeURIComponent(matchId)}/stints`, {
    method: "POST",
    body: stint,
  }).finally(() => invalidateMatchStats(matchId));
}

export function updateStint(stintId: string, changes: StintChanges): Promise<StintRecord> {
  return apiData<StintRecord>(`/stints/${encodeURIComponent(stintId)}`, {
    method: "PATCH",
    body: changes,
  }).then(forgetStatsOf);
}

export function deleteStint(stintId: string): Promise<StintRecord> {
  return apiData<StintRecord>(`/stints/${encodeURIComponent(stintId)}`, { method: "DELETE" }).then(
    forgetStatsOf,
  );
}
