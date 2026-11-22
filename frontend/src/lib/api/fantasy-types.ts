/** Tipos del Fantasy tal y como los devuelve la API. El dinero va en miles: 1000 = 1 M. */
import type { Position } from "./types";

export interface FantasyLeague {
  id: string;
  starts_on: string;
}

export interface CreatedLeague extends FantasyLeague {
  participants: number;
}

export interface FantasyParticipant {
  participant_id: string;
  display_name: string;
  balance: number;
  /** Copias máximas por plantilla (7). */
  squad_limit: number;
  /** Suma del valor de mi plantilla. */
  team_value: number;
  /** Cuenta del Fantasy del cuerpo técnico: nadie ve su plantilla, no clausula ni la clausulan. */
  private_squad?: boolean;
}

/** Venta abierta de una de mis copias. */
export interface CopyListing {
  listing_id: string;
  /** Precio mínimo que fijé; null si no puse ninguno. */
  min_price: number | null;
  closes_at: string;
}

/** Copia de un jugador real en mi plantilla. */
export interface SquadCopy {
  copy_id: string;
  player_id: string;
  name: string;
  dorsal: number;
  position: Position;
  /** Valor actual del jugador en la liga. */
  value: number;
  /** Cambio de valor en la última jornada cerrada; 0 si no hay. */
  value_change: number;
  listing: CopyListing | null;
  /** Cláusula de rescisión actual. */
  clause: number;
  /** Hasta cuándo no se puede clausular por fichaje reciente (puede haber pasado). */
  protected_until: string;
  /** Puntos del jugador en la última jornada puntuada (0 si no jugó); null si aún no hay ninguna. */
  last_points: number | null;
  /** Ruta de la foto del jugador, relativa a la API. Ver `photoSrc`. */
  photo_url?: string | null;
  /** Puntos en sus últimas jornadas puntuadas, de la más antigua a la más reciente. */
  recent_points?: number[];
}

/** 1 portero y 4 de campo; null es un hueco vacío, que puntúa 0. */
export interface FantasyLineup {
  goalkeeper_copy_id: string | null;
  field_copy_ids: (string | null)[];
  /** Copia capitana (puntúa doble) o null. */
  captain_copy_id: string | null;
}

export interface NextRound {
  match_id: string;
  opponent: string;
  held_on: string;
  /** Momento ISO en que se bloquea la alineación (00:00 en Madrid del día del partido). */
  locks_at: string;
}

export interface FantasyLeagueView {
  league: FantasyLeague;
  me: FantasyParticipant;
  squad: SquadCopy[];
  lineup: FantasyLineup;
  next_round: NextRound | null;
  /** Última jornada que ya puntúa (provisional o cerrada); null si aún no hay ninguna. */
  last_round: LastRound | null;
  /** Jornada ya bloqueada con el partido aún sin cerrar (normalmente, la de hoy). */
  live_round?: LastRound | null;
}

export interface LastRound {
  match_id: string;
  opponent: string;
  held_on: string;
}

/** Cuenta de partidos del cuerpo técnico: no tiene equipo, solo mira la clasificación. */
export interface FantasySpectatorView {
  league: FantasyLeague;
  spectator: true;
}

export type FantasyMe = { league: null } | FantasySpectatorView | FantasyLeagueView;

export function isSpectatorView(me: FantasyMe): me is FantasySpectatorView {
  return "spectator" in me && me.spectator === true;
}

/** pending: sin puntos; scored: provisional (sin cerrar la jornada); settled: cerrada y congelada. */
export type RoundStatus = "pending" | "scored" | "settled";

export interface StandingsRound {
  match_id: string;
  opponent: string;
  held_on: string;
  status: RoundStatus;
}

export interface StandingsRow {
  participant_id: string;
  display_name: string;
  total: number;
  points_by_round: Record<string, number>;
}

export interface FantasyStandings {
  rounds: StandingsRound[];
  /** Ya ordenadas por el servidor. */
  rows: StandingsRow[];
}

export interface RoundSlot {
  slot: Position;
  copy_id: string | null;
  player_id: string | null;
  name: string | null;
  rating: number | null;
  goals: number;
  /** Ya multiplicados si es el capitán. */
  points: number;
  captain: boolean;
}

export interface FantasyRound {
  match_id: string;
  status: RoundStatus;
  total: number;
  slots: RoundSlot[];
  /** Lo que cobré en la jornada; 0 si aún no está cerrada. */
  payout: number;
  /** Puntuó 0 por tener saldo negativo al bloquearse la alineación. */
  negative_balance: boolean;
}

/**
 * Equipo de otro participante, abierto desde la clasificación. Con la plantilla privada (y si no
 * es el mío) solo llega el nombre: `squad` vacío y sin valor ni alineación.
 */
export interface ParticipantTeam {
  participant_id: string;
  display_name: string;
  private_squad: boolean;
  team_value: number | null;
  squad: SquadCopy[];
  /** Última jornada con la alineación ya bloqueada; la de la próxima no se enseña. */
  last_round: LastRound | null;
  last_lineup: FantasyRound | null;
}

/** Otro participante (vendedor, comprador…). null en su lugar significa la banca. */
export interface ParticipantRef {
  participant_id: string;
  display_name: string;
}

export interface MarketListing {
  listing_id: string;
  copy_id: string;
  player_id: string;
  name: string;
  dorsal: number;
  position: Position;
  value: number;
  /** max(valor actual, precio mínimo del vendedor). */
  min_bid: number;
  /** null = la vende la banca. */
  seller: ParticipantRef | null;
  closes_at: string;
  my_bid: number | null;
  /** La vendo yo. */
  mine: boolean;
  /** Ruta de la foto del jugador, relativa a la API. Ver `photoSrc`. */
  photo_url?: string | null;
  /** Puntos en sus últimas jornadas puntuadas, de la más antigua a la más reciente. */
  recent_points?: number[];
}

export interface FantasyMarket {
  /** Ya ordenados por cierre y nombre. */
  listings: MarketListing[];
}

export interface BankSale {
  price: number;
  balance: number;
}

export type TransferKind = "market" | "bank_sale" | "clause";

export interface Transfer {
  at: string;
  kind: TransferKind;
  player_id: string;
  name: string;
  /** null = la banca. */
  from: ParticipantRef | null;
  to: ParticipantRef | null;
  price: number;
}

export interface FantasyTransfers {
  /** Del más reciente al más antiguo. */
  transfers: Transfer[];
}

/** Copia con dueño de la liga y su cláusula. */
export interface ClauseCopy {
  copy_id: string;
  player_id: string;
  name: string;
  dorsal: number;
  position: Position;
  value: number;
  clause: number;
  owner: ParticipantRef;
  protected_until: string;
  /** Es mía. */
  mine: boolean;
  /** Ruta de la foto del jugador, relativa a la API. Ver `photoSrc`. */
  photo_url?: string | null;
  /** Puntos en sus últimas jornadas puntuadas, de la más antigua a la más reciente. */
  recent_points?: number[];
}

export interface FantasyClauses {
  /** Hoy hay partido (hora de Madrid): nadie puede clausular. */
  match_day: boolean;
  /** Ya ordenadas por dueño y dorsal. */
  copies: ClauseCopy[];
}

export interface ClauseRaise {
  clause: number;
  cost: number;
  balance: number;
}
