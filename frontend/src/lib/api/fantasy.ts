import { queryCache } from "@/lib/query-cache";

import { apiData } from "./client";
import type {
  BankSale,
  ClauseRaise,
  FantasyClauses,
  CreatedLeague,
  FantasyMarket,
  FantasyTransfers,
  MarketListing,
  FantasyLineup,
  FantasyMe,
  FantasyRound,
  FantasyStandings,
} from "./fantasy-types";

/** Claves de caché del Fantasy (las usan las consultas de `lib/queries.ts`). */
export const FANTASY_ME_KEY = "fantasy:me";
export const FANTASY_STANDINGS_KEY = "fantasy:standings";
export const FANTASY_MARKET_KEY = "fantasy:market";
export const FANTASY_TRANSFERS_KEY = "fantasy:transfers";
export const FANTASY_CLAUSES_KEY = "fantasy:clauses";
const FANTASY_ROUND_PREFIX = "fantasy:round:";
export function fantasyRoundKey(matchId: string): string {
  return `${FANTASY_ROUND_PREFIX}${matchId}`;
}

/**
 * Lo que cambia la liga entera (crearla, que un partido pase a contar o deje de contar como
 * jornada), mi alineación, el mercado o las cláusulas (pujas, ventas, clausulazos, que al
 * escribir se procesen cierres vencidos o jornadas) deja viejas mi vista, la clasificación, el
 * mercado, los fichajes, las cláusulas y el detalle de cualquier jornada.
 */
export function invalidateFantasy(): void {
  queryCache.invalidate(FANTASY_ME_KEY);
  queryCache.invalidate(FANTASY_STANDINGS_KEY);
  queryCache.invalidate(FANTASY_MARKET_KEY);
  queryCache.invalidate(FANTASY_TRANSFERS_KEY);
  queryCache.invalidate(FANTASY_CLAUSES_KEY);
  queryCache.invalidatePrefix(FANTASY_ROUND_PREFIX);
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

/** Guarda la alineación de la próxima jornada. Haya ido bien o no, se olvida el Fantasy cacheado. */
export function saveLineup(lineup: FantasyLineup): Promise<FantasyLineup> {
  return apiData<FantasyLineup>("/fantasy/lineup", { method: "PUT", body: lineup }).finally(invalidateFantasy);
}

export function getMarket(): Promise<FantasyMarket> {
  return apiData<FantasyMarket>("/fantasy/market");
}

export function getTransfers(): Promise<FantasyTransfers> {
  return apiData<FantasyTransfers>("/fantasy/transfers");
}

/*
 * Escrituras del mercado. Haya ido bien o no (una venta pudo cerrarse entre medias), se olvida
 * todo lo del Fantasy: saldo, plantilla, mercado y fichajes.
 */

function listingPath(listingId: string): string {
  return `/fantasy/market/${encodeURIComponent(listingId)}/bid`;
}

function copyPath(copyId: string, action: "listing" | "sell" | "clause" | "clause/buy"): string {
  return `/fantasy/copies/${encodeURIComponent(copyId)}/${action}`;
}

/** Crea o cambia mi puja (en miles). Devuelve la venta actualizada. */
export function placeBid(listingId: string, amount: number): Promise<MarketListing> {
  return apiData<MarketListing>(listingPath(listingId), { method: "PUT", body: { amount } }).finally(
    invalidateFantasy,
  );
}

export function withdrawBid(listingId: string): Promise<void> {
  return apiData<void>(listingPath(listingId), { method: "DELETE" }).finally(invalidateFantasy);
}

/** Pone a la venta una copia propia durante 24 h; `minPrice` en miles o null sin mínimo. */
export function listCopy(copyId: string, minPrice: number | null): Promise<MarketListing> {
  return apiData<MarketListing>(copyPath(copyId, "listing"), {
    method: "POST",
    body: { min_price: minPrice },
  }).finally(invalidateFantasy);
}

/** Retira la venta y anula sus pujas. */
export function unlistCopy(copyId: string): Promise<void> {
  return apiData<void>(copyPath(copyId, "listing"), { method: "DELETE" }).finally(invalidateFantasy);
}

/** Venta inmediata a la banca por el 70 % del valor. */
export function sellToBank(copyId: string): Promise<BankSale> {
  return apiData<BankSale>(copyPath(copyId, "sell"), { method: "POST" }).finally(invalidateFantasy);
}

export function getClauses(): Promise<FantasyClauses> {
  return apiData<FantasyClauses>("/fantasy/clauses");
}

/** Clausulazo: pago la cláusula y la copia es mía al momento. */
export function buyClause(copyId: string): Promise<BankSale> {
  return apiData<BankSale>(copyPath(copyId, "clause/buy"), { method: "POST" }).finally(invalidateFantasy);
}

/** Subo la cláusula de una copia mía (en miles) pagando la mitad de la subida. */
export function raiseClause(copyId: string, clause: number): Promise<ClauseRaise> {
  return apiData<ClauseRaise>(copyPath(copyId, "clause"), { method: "PUT", body: { clause } }).finally(
    invalidateFantasy,
  );
}
