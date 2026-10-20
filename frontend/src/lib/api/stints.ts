import { apiData } from "./client";
import type { StintRecord } from "./match-types";

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
  });
}

export function updateStint(stintId: string, changes: StintChanges): Promise<StintRecord> {
  return apiData<StintRecord>(`/stints/${encodeURIComponent(stintId)}`, {
    method: "PATCH",
    body: changes,
  });
}

export function deleteStint(stintId: string): Promise<StintRecord> {
  return apiData<StintRecord>(`/stints/${encodeURIComponent(stintId)}`, { method: "DELETE" });
}
