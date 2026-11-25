/**
 * Registro de eventos del partido de solo añadir: deshacer es un evento compensatorio. Espejo en
 * TypeScript de `backend/app/domain/stints/events.py` (autoritativa).
 */

export type EventKind =
  | "goal"
  | "assist"
  | "shot"
  | "turnover"
  | "steal"
  | "key_action"
  | "foul"
  | "yellow"
  | "red"
  | "rival_goal"
  | "save"
  | "undo";

/** Misma forma que `EventOut` de la API. */
export interface MatchEvent {
  id: string;
  kind: EventKind;
  part: number;
  t: number;
  player_id: string | null;
  voids_event_id: string | null;
  /** Solo en los goles, opcionales: tipos y punto de media pista (`lib/match/goal-detail.ts`). */
  goal_tags?: string[] | null;
  goal_x?: number | null;
  goal_y?: number | null;
}

export class EventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventError";
  }
}

function voidTarget(
  event: MatchEvent,
  seen: ReadonlyMap<string, MatchEvent>,
  voided: ReadonlySet<string>,
): string {
  const targetId = event.voids_event_id;
  if (targetId == null) {
    throw new EventError(`El evento ${event.id} deshace algo pero no indica qué`);
  }
  const target = seen.get(targetId);
  if (!target) throw new EventError(`El evento ${event.id} deshace uno desconocido: ${targetId}`);
  if (target.kind === "undo") throw new EventError(`No se puede deshacer un deshacer: ${targetId}`);
  if (voided.has(targetId)) throw new EventError(`El evento ${targetId} ya estaba deshecho`);
  return targetId;
}

/** Eventos que cuentan: sin los deshechos ni los propios "deshacer". */
export function effectiveEvents(events: readonly MatchEvent[]): MatchEvent[] {
  const seen = new Map<string, MatchEvent>();
  const voided = new Set<string>();
  for (const event of events) {
    if (seen.has(event.id)) throw new EventError(`Id de evento duplicado: ${event.id}`);
    if (event.kind === "undo") voided.add(voidTarget(event, seen, voided));
    seen.set(event.id, event);
  }
  return events.filter((event) => event.kind !== "undo" && !voided.has(event.id));
}

/** El último evento efectivo, que es el que deshace el botón "Deshacer". */
export function undoTarget(events: readonly MatchEvent[]): MatchEvent | null {
  return effectiveEvents(events).at(-1) ?? null;
}

export function teamFoulsByPart(events: readonly MatchEvent[]): Record<number, number> {
  const fouls: Record<number, number> = {};
  for (const event of effectiveEvents(events)) {
    if (event.kind === "foul") fouls[event.part] = (fouls[event.part] ?? 0) + 1;
  }
  return fouls;
}

export function score(events: readonly MatchEvent[]): { for: number; against: number } {
  const effective = effectiveEvents(events);
  return {
    for: effective.filter((event) => event.kind === "goal").length,
    against: effective.filter((event) => event.kind === "rival_goal").length,
  };
}
