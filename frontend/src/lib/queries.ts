/**
 * Lecturas de cada pestaña, con la clave de caché que comparten la pantalla y la precarga: así lo
 * que se precarga es exactamente lo que la pantalla busca al entrar.
 */
import type { Match } from "@/lib/api/match-types";
import { listMatches } from "@/lib/api/matches";
import { listPlayers } from "@/lib/api/players";
import { getCallup, listInfractions, listMovements, listSessions } from "@/lib/api/points";
import { getSeasonStats } from "@/lib/api/stats";
import type { SeasonStats } from "@/lib/api/stats-types";
import type { Callup, Infraction, Movement, Player, TeamSession } from "@/lib/api/types";

export interface Query<T> {
  key: string;
  fetch: () => Promise<T>;
}

export interface PointsReference {
  players: Player[];
  infractions: Infraction[];
}

export const playersQuery: Query<Player[]> = { key: "/players", fetch: () => listPlayers() };
export const matchesQuery: Query<Match[]> = { key: "/matches", fetch: listMatches };
export const seasonStatsQuery: Query<SeasonStats> = {
  key: "stats:season",
  fetch: getSeasonStats,
};

export const pointsReferenceQuery: Query<PointsReference> = {
  key: "puntos:reference",
  fetch: async () => {
    const [players, infractions] = await Promise.all([listPlayers(true), listInfractions()]);
    return { players, infractions };
  },
};

export const callupQuery = (week: string): Query<Callup> => ({
  key: `callup:${week}`,
  fetch: () => getCallup(week),
});
export const sessionsQuery = (week: string): Query<TeamSession[]> => ({
  key: `sessions:${week}`,
  fetch: () => listSessions(week),
});
export const movementsQuery = (week: string): Query<Movement[]> => ({
  key: `movements:${week}`,
  fetch: () => listMovements(week),
});
