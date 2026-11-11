import { queryCache } from "@/lib/query-cache";

import { apiData } from "./client";
import type {
  CreatedLeague,
  FantasyLineup,
  FantasyMe,
  FantasyRound,
  FantasyStandings,
} from "./fantasy-types";

/** Claves de caché del Fantasy (las usan las consultas de `lib/queries.ts`). */
export const FANTASY_ME_KEY = "fantasy:me";
export const FANTASY_STANDINGS_KEY = "fantasy:standings";
export function fantasyRoundKey(matchId: string): string {
  return `fantasy:round:${matchId}`;
}

/**
 * Lo que cambia la liga entera (crearla, o que un partido pase a contar o deje de contar como
 * jornada) deja viejas mi vista y la clasificación.
 */
export function invalidateFantasy(): void {
  queryCache.invalidate(FANTASY_ME_KEY);
  queryCache.invalidate(FANTASY_STANDINGS_KEY);
}

export function getFantasyMe(): Promise<FantasyMe> {
  return apiData<FantasyMe>("/fantasy/me");
}

export function getStandings(): Promise<FantasyStandings> {
  return apiData<FantasyStandings>("/fantasy/standings");
}

export function getMyRound(matchId: string): Promise<FantasyRound> {
  return apiData<FantasyRound>(`/fantasy/rounds/${encodeURIComponent(matchId)}/me`);
}

export function createLeague(): Promise<CreatedLeague> {
  return apiData<CreatedLeague>("/fantasy/league", { method: "POST" }).finally(invalidateFantasy);
}

/** Guarda la alineación de la próxima jornada. Haya ido bien o no, se olvida mi vista cacheada. */
export function saveLineup(lineup: FantasyLineup, nextMatchId: string | null): Promise<FantasyLineup> {
  return apiData<FantasyLineup>("/fantasy/lineup", { method: "PUT", body: lineup }).finally(() => {
    queryCache.invalidate(FANTASY_ME_KEY);
    if (nextMatchId) queryCache.invalidate(fantasyRoundKey(nextMatchId));
  });
}
