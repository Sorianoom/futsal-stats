import type { EventIn, LineupEventRecord, LoggedEvent, RatingIn } from "@/lib/api/match-types";

import { LineupError, replayRecords } from "./lineup";

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

export interface DroppedLog {
  lineup: readonly LineupEventRecord[];
  events: readonly LoggedEvent[];
  outbox: Outbox;
  /** Ids quitados: los rechazados, lo que dejó de ser posible sin ellos y lo que deshacía algo quitado. */
  dropped: ReadonlySet<string>;
  /** Movimientos pendientes quitados porque dependían de algo rechazado (p. ej. sacar a quien no entró). */
  impossible: readonly LineupEventRecord[];
}

function voidsOf(item: LineupEventRecord | LoggedEvent | EventIn): string | null {
  if ("payload" in item) return item.payload.type === "undo" ? item.payload.voids_event_id : null;
  return item.voids_event_id ?? null;
}

function fits(records: readonly LineupEventRecord[]): boolean {
  try {
    replayRecords(records);
    return true;
  } catch (error) {
    if (error instanceof LineupError) return false;
    throw error;
  }
}

/** Añade a `dropped` lo que deshace algo quitado, hasta que no crezca. */
function dropUndosOfDropped(
  items: readonly (LineupEventRecord | LoggedEvent | EventIn)[],
  dropped: Set<string>,
): void {
  let grew = true;
  while (grew) {
    grew = false;
    for (const item of items) {
      const voids = voidsOf(item);
      if (voids !== null && dropped.has(voids) && !dropped.has(item.id)) {
        dropped.add(item.id);
        grew = true;
      }
    }
  }
}

/**
 * Quita de la vista y de la bandeja lo que el servidor rechazó, junto con lo que dependía de ello:
 * los deshacer que apuntan a algo quitado y los movimientos de alineación pendientes que ya no son
 * posibles (si no, el registro local dejaría de ser coherente). Lo de `settled` ya lo aceptó el
 * servidor y no se toca.
 */
export function dropRejected(
  lineup: readonly LineupEventRecord[],
  events: readonly LoggedEvent[],
  outbox: Outbox,
  rejected: ReadonlySet<string>,
  settled: ReadonlySet<string> = new Set(),
): DroppedLog {
  const dropped = new Set(rejected);
  const all = [...lineup, ...events, ...outbox.lineup, ...outbox.events];
  const pending = new Set(outbox.lineup.map((item) => item.id));
  const impossible: LineupEventRecord[] = [];
  const kept: LineupEventRecord[] = [];
  for (const record of lineup) {
    dropUndosOfDropped(all, dropped);
    if (dropped.has(record.id)) continue;
    const candidate = [...kept, record];
    if (pending.has(record.id) && !settled.has(record.id) && !fits(candidate)) {
      dropped.add(record.id);
      if (record.payload.type !== "undo") impossible.push(record);
      continue;
    }
    kept.push(record);
  }
  dropUndosOfDropped(all, dropped);
  return {
    lineup: lineup.filter((item) => !dropped.has(item.id)),
    events: events.filter((item) => !dropped.has(item.id)),
    outbox: without(outbox, dropped),
    dropped,
    impossible,
  };
}
