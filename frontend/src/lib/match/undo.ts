/**
 * Qué deshace el botón «Deshacer»: lo último anotado, sea un evento de juego o un movimiento de
 * alineación (cambio, expulsión, inicio o fin de parte). Los movimientos se deshacen como una pila
 * (ver `effectiveLineup`). La roja se deshace junto con su expulsión.
 */

import type { LineupEventRecord, LoggedEvent } from "@/lib/api/match-types";
import { EVENT_LABEL, describeEvent } from "@/lib/labels";

import { effectiveEvents } from "./events";
import { effectiveLineup } from "./lineup";

export type UndoAction =
  | { kind: "event"; event: LoggedEvent }
  | { kind: "lineup"; record: LineupEventRecord; part: number }
  | { kind: "red"; event: LoggedEvent; record: LineupEventRecord }
  /** Una roja cuya expulsión ya no es el último movimiento: no se puede deshacer desde aquí. */
  | { kind: "blocked"; event: LoggedEvent };

/** Orden de lo anotado en esta sesión (id → contador). Lo que no está aquí vino ya guardado. */
export type SessionOrder = ReadonlyMap<string, number>;

// A igual parte y tiempo: el inicio de parte va antes que todo y el fin después de todo. Un cambio
// se supone anterior a un evento del mismo segundo (el evento es del quinteto que entra).
const RANK = { part_started: 0, substituted: 1, sent_off: 1, event: 2, part_ended: 3 } as const;

interface Candidate {
  id: string;
  key: readonly [number, number, number];
}

function lastLineup(lineup: readonly LineupEventRecord[]): { record: LineupEventRecord; part: number } | null {
  const effective = effectiveLineup(lineup);
  let part = 0;
  for (const { payload } of effective) {
    if (payload.type === "part_started") part = payload.part;
  }
  const record = effective.at(-1);
  return record ? { record, part } : null;
}

function lineupKey(record: LineupEventRecord, part: number): Candidate["key"] {
  const { payload } = record;
  if (payload.type === "undo") return [part, 0, 0];
  const t = payload.type === "part_started" ? 0 : payload.t;
  return [part, t, RANK[payload.type]];
}

/** True si `a` se anotó después que `b`. */
function isLater(a: Candidate, b: Candidate, order: SessionOrder): boolean {
  const [inA, inB] = [order.get(a.id), order.get(b.id)];
  if (inA !== undefined || inB !== undefined) return (inA ?? -1) > (inB ?? -1);
  for (let i = 0; i < a.key.length; i += 1) {
    if (a.key[i] !== b.key[i]) return a.key[i] > b.key[i];
  }
  return false;
}

function pairsWithRed(event: LoggedEvent | null, record: LineupEventRecord | undefined): boolean {
  return (
    event?.kind === "red" &&
    record?.payload.type === "sent_off" &&
    record.payload.player_id === event.player_id
  );
}

/** Lo que deshace el botón, o null si no hay nada (o el registro no es coherente). */
export function chooseUndo(
  lineup: readonly LineupEventRecord[],
  events: readonly LoggedEvent[],
  order: SessionOrder,
): UndoAction | null {
  let move: { record: LineupEventRecord; part: number } | null;
  let event: LoggedEvent | null;
  try {
    move = lastLineup(lineup);
    event = (effectiveEvents(events).at(-1) as LoggedEvent | undefined) ?? null;
  } catch {
    return null;
  }
  if (event && move && pairsWithRed(event, move.record)) {
    return { kind: "red", event, record: move.record };
  }
  if (event && move) {
    const eventCandidate: Candidate = { id: event.id, key: [event.part, event.t, RANK.event] };
    const moveCandidate: Candidate = { id: move.record.id, key: lineupKey(move.record, move.part) };
    if (isLater(moveCandidate, eventCandidate, order)) return { kind: "lineup", ...move };
  } else if (move) {
    return { kind: "lineup", ...move };
  }
  if (!event) return null;
  return event.kind === "red" ? { kind: "blocked", event } : { kind: "event", event };
}

/** Id de lo que se deshace: el evento (también en una roja, que va con su expulsión) o el movimiento. */
export function undoTargetId(action: UndoAction): string {
  return action.kind === "lineup" ? action.record.id : action.event.id;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function describeMove(
  record: LineupEventRecord,
  part: number,
  nameOf: (playerId: string) => string,
  timeText: (t: number) => string,
): string {
  const { payload } = record;
  switch (payload.type) {
    case "substituted":
      return `Deshacer cambio: entra ${nameOf(payload.player_in)}, sale ${nameOf(payload.player_out)} (${timeText(payload.t)})`;
    case "sent_off":
      return `Deshacer expulsión de ${nameOf(payload.player_id)} (${timeText(payload.t)})`;
    case "part_ended":
      return `Deshacer fin de la ${part}ª parte (${timeText(payload.t)})`;
    case "part_started":
      return `Deshacer inicio de la ${payload.part}ª parte`;
    case "undo":
      return EVENT_LABEL.undo;
  }
}

/** «Deshacer cambio: entra X, sale Y (12:34)». `timeText` da el tiempo tal y como se ve. */
export function describeUndo(
  action: UndoAction,
  nameOf: (playerId: string) => string,
  timeText: (t: number) => string,
): string {
  switch (action.kind) {
    case "lineup":
      return describeMove(action.record, action.part, nameOf, timeText);
    case "red":
    case "event":
    case "blocked":
      return `Deshacer ${lowerFirst(describeEvent(action.event, nameOf))} (${timeText(action.event.t)})`;
  }
}
