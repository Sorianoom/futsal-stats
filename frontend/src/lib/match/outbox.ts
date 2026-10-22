import type { EventIn, LineupEventRecord, LoggedEvent, RatingIn } from "@/lib/api/match-types";

/** Lo anotado que todavía no ha confirmado el servidor. */
export interface Outbox {
  lineup: readonly LineupEventRecord[];
  events: readonly EventIn[];
  ratings: readonly RatingIn[];
}

export const EMPTY_OUTBOX: Outbox = { lineup: [], events: [], ratings: [] };

export function size(outbox: Outbox): number {
  return outbox.lineup.length + outbox.events.length + outbox.ratings.length;
}

export function idsOf(outbox: Outbox): Set<string> {
  return new Set([...outbox.lineup, ...outbox.events, ...outbox.ratings].map((item) => item.id));
}

export function without(outbox: Outbox, ids: ReadonlySet<string>): Outbox {
  return {
    lineup: outbox.lineup.filter((item) => !ids.has(item.id)),
    events: outbox.events.filter((item) => !ids.has(item.id)),
    ratings: outbox.ratings.filter((item) => !ids.has(item.id)),
  };
}

export interface ConfirmedLog {
  lineup: readonly LineupEventRecord[];
  events: readonly LoggedEvent[];
}

/** Lo que el servidor ya tiene: la vista completa menos lo que sigue pendiente en la bandeja. */
export function confirmedOf(
  lineup: readonly LineupEventRecord[],
  events: readonly LoggedEvent[],
  pending: Outbox,
): ConfirmedLog {
  const pendingIds = idsOf(pending);
  return {
    lineup: lineup.filter((item) => !pendingIds.has(item.id)),
    events: events.filter((item) => !pendingIds.has(item.id)),
  };
}

/** Une dos bandejas; lo que está en las dos cuenta una sola vez. */
export function plus(outbox: Outbox, extra: Outbox): Outbox {
  const merge = <T extends { id: string }>(base: readonly T[], added: readonly T[]): T[] => {
    const known = new Set(base.map((item) => item.id));
    return [...base, ...added.filter((item) => !known.has(item.id))];
  };
  return {
    lineup: merge(outbox.lineup, extra.lineup),
    events: merge(outbox.events, extra.events),
    ratings: merge(outbox.ratings, extra.ratings),
  };
}

export function toEventIn(event: LoggedEvent): EventIn {
  return {
    id: event.id,
    seq: event.seq,
    kind: event.kind,
    part: event.part,
    t: event.t,
    player_id: event.player_id,
    voids_event_id: event.voids_event_id,
  };
}

function toLoggedEvent(event: EventIn): LoggedEvent {
  return {
    id: event.id,
    seq: event.seq,
    kind: event.kind,
    part: event.part,
    t: event.t,
    player_id: event.player_id ?? null,
    voids_event_id: event.voids_event_id ?? null,
  };
}

export interface RestoredLog {
  lineup: readonly LineupEventRecord[];
  events: readonly LoggedEvent[];
  outbox: Outbox;
  /** Ids recuperados del disco: pudieron llegar al servidor aunque la respuesta se perdiera. */
  recovered: ReadonlySet<string>;
}

const bySeq = (a: { seq: number }, b: { seq: number }): number => a.seq - b.seq;

/**
 * Une lo que dice el servidor con lo que quedó guardado sin confirmar. Lo que el servidor ya tiene
 * se descarta de la bandeja; el resto se suma a la vista para seguir anotando donde se dejó.
 * Las valoraciones no se listan en el servidor: se reenvían todas (el envío es idempotente).
 */
export function restoreOutbox(
  saved: Outbox,
  serverLineup: readonly LineupEventRecord[],
  serverEvents: readonly LoggedEvent[],
): RestoredLog {
  const knownLineup = new Set(serverLineup.map((item) => item.id));
  const knownEvents = new Set(serverEvents.map((item) => item.id));
  const outbox: Outbox = {
    lineup: saved.lineup.filter((item) => !knownLineup.has(item.id)),
    events: saved.events.filter((item) => !knownEvents.has(item.id)),
    ratings: saved.ratings,
  };
  return {
    lineup: [...serverLineup, ...outbox.lineup].sort(bySeq),
    events: [...serverEvents, ...outbox.events.map(toLoggedEvent)].sort(bySeq),
    outbox,
    recovered: idsOf(outbox),
  };
}
