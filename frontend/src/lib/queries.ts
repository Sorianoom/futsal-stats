/**
 * Lecturas de cada pestaña, con la clave de caché que comparten la pantalla y la precarga: así lo
 * que se precarga es exactamente lo que la pantalla busca al entrar.
 */
import { ApiError } from "@/lib/api/client";
import type { Match } from "@/lib/api/match-types";
import {
  FANTASY_MARKET_KEY,
  FANTASY_ME_KEY,
  FANTASY_STANDINGS_KEY,
  FANTASY_TRANSFERS_KEY,
  FANTASY_CLAUSES_KEY,
  fantasyRoundKey,
  getClauses,
  getFantasyMe,
  getMarket,
  getMyRound,
  getStandings,
  getTransfers,
} from "@/lib/api/fantasy";
import type {
  FantasyClauses,
  FantasyMarket,
  FantasyMe,
  FantasyRound,
  FantasyStandings,
  FantasyTransfers,
} from "@/lib/api/fantasy-types";
import { MATCHES_KEY, listMatches } from "@/lib/api/matches";
import { listPlayers } from "@/lib/api/players";
import { getCallup, listInfractions, listMovements, listSessions } from "@/lib/api/points";
import { SEASON_STATS_KEY, getMatchStats, getSeasonStats, matchStatsKey } from "@/lib/api/stats";
import type { MatchStats, SeasonStats } from "@/lib/api/stats-types";
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
/** Se invalida al marcar un partido como oficial o amistoso (ver `setMatchOfficial`). */
export const matchesQuery: Query<Match[]> = { key: MATCHES_KEY, fetch: listMatches };
/** Se invalida junto con el detalle de cualquier partido (ver `invalidateMatchStats`). */
export const seasonStatsQuery: Query<SeasonStats> = {
  key: SEASON_STATS_KEY,
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

const NOT_FOUND = 404;
const CONFLICT = 409;

/** Un partido inexistente o con eventos incoherentes es una respuesta, no un fallo que reintentar. */
export type MatchStatsResult =
  | { status: "ok"; stats: MatchStats }
  | { status: "not_found" }
  | { status: "incoherent" };

async function fetchMatchStats(matchId: string): Promise<MatchStatsResult> {
  try {
    return { status: "ok", stats: await getMatchStats(matchId) };
  } catch (failure) {
    if (failure instanceof ApiError && failure.status === NOT_FOUND) return { status: "not_found" };
    if (failure instanceof ApiError && failure.status === CONFLICT) return { status: "incoherent" };
    throw failure;
  }
}

/** Se invalida al registrar o corregir eventos, alineación o tramos del partido (ver `invalidateMatchStats`). */
export const matchStatsQuery = (matchId: string): Query<MatchStatsResult> => ({
  key: matchStatsKey(matchId),
  fetch: () => fetchMatchStats(matchId),
});

/**
 * Se invalidan al crear la liga, guardar la alineación, cambiar qué partidos son oficiales o con
 * cualquier escritura del mercado (ver `invalidateFantasy`).
 */
export const fantasyMeQuery: Query<FantasyMe> = { key: FANTASY_ME_KEY, fetch: getFantasyMe };
export const fantasyStandingsQuery: Query<FantasyStandings> = {
  key: FANTASY_STANDINGS_KEY,
  fetch: getStandings,
};
export const fantasyRoundQuery = (matchId: string): Query<FantasyRound> => ({
  key: fantasyRoundKey(matchId),
  fetch: () => getMyRound(matchId),
});
export const fantasyMarketQuery: Query<FantasyMarket> = { key: FANTASY_MARKET_KEY, fetch: getMarket };
export const fantasyTransfersQuery: Query<FantasyTransfers> = {
  key: FANTASY_TRANSFERS_KEY,
  fetch: getTransfers,
};
export const fantasyClausesQuery: Query<FantasyClauses> = { key: FANTASY_CLAUSES_KEY, fetch: getClauses };
