/**
 * Transiciones puras del quinteto en pista. Es el espejo en TypeScript de
 * `backend/app/domain/stints/lineup.py` (que es la autoritativa) y se prueba contra el mismo
 * fixture compartido. Todos los tiempos son segundos dentro de la parte. Cada función devuelve un
 * estado nuevo y nunca modifica el anterior.
 */

const FULL_TEAM_ON_COURT = 5;
const VALID_PARTS: readonly number[] = [1, 2];

export class LineupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LineupError";
  }
}

/** Tramo cerrado: un jugador en pista entre `start` y `end`. */
export interface Stint {
  player_id: string;
  part: number;
  start: number;
  end: number;
}

/** Tramo abierto: el jugador está en pista desde `start` y aún no ha salido. */
export interface OpenStint {
  player_id: string;
  part: number;
  start: number;
}

export interface LineupState {
  readonly currentPart: number | null;
  readonly lastEndedPart: number;
  readonly clock: number;
  readonly open: readonly OpenStint[];
  readonly closed: readonly Stint[];
  readonly sentOff: readonly string[];
}

/** Mismas formas que los eventos de alineación de la API (`LineupPayload`). */
export type LineupEvent =
  | { type: "part_started"; part: number; starters: readonly string[] }
  | { type: "substituted"; t: number; player_out: string; player_in: string }
  | { type: "sent_off"; t: number; player_id: string }
  | { type: "part_ended"; t: number };

/** Evento compensatorio: anula el último movimiento vigente (`voids_event_id`). */
export interface LineupUndo {
  type: "undo";
  voids_event_id: string;
}

/** Lo que se guarda en el registro de alineación: un movimiento o el deshacer de uno. */
export type LineupPayload = LineupEvent | LineupUndo;

/** Un par de un cambio: quién sale y quién entra. */
export interface SubstitutionPair {
  out: string;
  in: string;
}

export function emptyLineup(): LineupState {
  return { currentPart: null, lastEndedPart: 0, clock: 0, open: [], closed: [], sentOff: [] };
}

export function onCourt(state: LineupState): readonly string[] {
  return state.open.map((stint) => stint.player_id);
}

function capacity(state: LineupState): number {
  return FULL_TEAM_ON_COURT - state.sentOff.length;
}

function requirePartInProgress(state: LineupState, t: number): number {
  if (state.currentPart === null) throw new LineupError("No hay ninguna parte en juego");
  if (t < state.clock) {
    throw new LineupError(`El tiempo ${t}s es anterior al reloj actual ${state.clock}s`);
  }
  return state.currentPart;
}

interface Stints {
  open: readonly OpenStint[];
  closed: readonly Stint[];
}

function closeStint({ open, closed }: Stints, playerId: string, t: number): Stints {
  const opened = open.find((stint) => stint.player_id === playerId);
  if (!opened) throw new LineupError(`${playerId} no está en pista`);
  const remaining = open.filter((stint) => stint !== opened);
  if (t === opened.start) return { open: remaining, closed };
  const stint: Stint = { player_id: playerId, part: opened.part, start: opened.start, end: t };
  return { open: remaining, closed: [...closed, stint] };
}

function startPart(state: LineupState, part: number, starters: readonly string[]): LineupState {
  if (!VALID_PARTS.includes(part)) throw new LineupError(`Parte inválida: ${part}`);
  if (state.currentPart !== null) throw new LineupError("Ya hay una parte en juego");
  if (part !== state.lastEndedPart + 1) {
    throw new LineupError(`La parte ${part} no puede empezar tras la parte ${state.lastEndedPart}`);
  }
  if (new Set(starters).size !== starters.length) throw new LineupError("Titulares duplicados");
  if (starters.length > capacity(state)) {
    throw new LineupError(
      `Hay ${starters.length} titulares y la capacidad es ${capacity(state)}`,
    );
  }
  if (starters.some((player) => state.sentOff.includes(player))) {
    throw new LineupError("Un jugador expulsado no puede ser titular");
  }
  const open = starters.map((player): OpenStint => ({ player_id: player, part, start: 0 }));
  return { ...state, currentPart: part, clock: 0, open };
}

function substitute(
  state: LineupState,
  t: number,
  playerOut: string,
  playerIn: string,
): LineupState {
  const part = requirePartInProgress(state, t);
  if (!onCourt(state).includes(playerOut)) throw new LineupError(`${playerOut} no está en pista`);
  if (onCourt(state).includes(playerIn)) throw new LineupError(`${playerIn} ya está en pista`);
  if (state.sentOff.includes(playerIn)) throw new LineupError(`${playerIn} está expulsado`);
  const { open, closed } = closeStint(state, playerOut, t);
  const entering: OpenStint = { player_id: playerIn, part, start: t };
  return { ...state, clock: t, open: [...open, entering], closed };
}

function sendOff(state: LineupState, t: number, playerId: string): LineupState {
  requirePartInProgress(state, t);
  if (!onCourt(state).includes(playerId)) throw new LineupError(`${playerId} no está en pista`);
  const { open, closed } = closeStint(state, playerId, t);
  return { ...state, clock: t, open, closed, sentOff: [...state.sentOff, playerId] };
}

function endPart(state: LineupState, t: number): LineupState {
  const part = requirePartInProgress(state, t);
  const players = [...onCourt(state)].sort();
  const { open, closed } = players.reduce<Stints>(
    (stints, player) => closeStint(stints, player, t),
    state,
  );
  return { ...state, currentPart: null, lastEndedPart: part, clock: t, open, closed };
}

export function applyEvent(state: LineupState, event: LineupEvent): LineupState {
  switch (event.type) {
    case "part_started":
      return startPart(state, event.part, event.starters);
    case "substituted":
      return substitute(state, event.t, event.player_out, event.player_in);
    case "sent_off":
      return sendOff(state, event.t, event.player_id);
    case "part_ended":
      return endPart(state, event.t);
  }
}

export function replay(events: Iterable<LineupEvent>): LineupState {
  let state = emptyLineup();
  for (const event of events) state = applyEvent(state, event);
  return state;
}

/** Segundos en pista por jugador a partir de tramos cerrados. */
export function secondsByPlayer(stints: readonly Stint[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const stint of stints) {
    totals[stint.player_id] = (totals[stint.player_id] ?? 0) + (stint.end - stint.start);
  }
  return totals;
}

/** Como `secondsByPlayer`, sumando lo que llevan los que siguen en pista hasta el tiempo `t`. */
export function liveSecondsByPlayer(state: LineupState, t: number): Record<string, number> {
  if (t < state.clock) {
    throw new LineupError(`El tiempo ${t}s es anterior al reloj actual ${state.clock}s`);
  }
  const stillOpen = state.open.map((stint): Stint => ({ ...stint, end: t }));
  return secondsByPlayer([...state.closed, ...stillOpen]);
}

interface LineupRecordLike {
  id: string;
  payload: LineupPayload;
}

type UndoProblem = "void_target_missing" | "void_of_undo" | "void_not_last";

const UNDO_MESSAGES: Record<UndoProblem, string> = {
  void_target_missing: "Se deshace un movimiento desconocido",
  void_of_undo: "No se puede deshacer un deshacer",
  void_not_last: "Solo se puede deshacer el último movimiento de alineación",
};

function undoProblem(
  stack: readonly LineupRecordLike[],
  seen: ReadonlyMap<string, boolean>,
  voids: string,
): UndoProblem | null {
  if (!seen.has(voids)) return "void_target_missing";
  if (seen.get(voids)) return "void_of_undo";
  if (stack.at(-1)?.id !== voids) return "void_not_last";
  return null;
}

/**
 * Movimientos que cuentan, en orden: sin los deshechos ni los propios deshacer. Deshacer es una
 * pila: solo se anula el último movimiento vigente, así que encadenar deshaceres va hacia atrás
 * uno a uno y la alineación nunca queda incoherente. Espejo de `effective_lineup` de Python.
 */
export function effectiveLineup<T extends LineupRecordLike>(records: readonly T[]): T[] {
  const stack: T[] = [];
  const seen = new Map<string, boolean>();
  for (const record of records) {
    if (seen.has(record.id)) throw new LineupError(`Id de movimiento duplicado: ${record.id}`);
    const { payload } = record;
    if (payload.type === "undo") {
      const problem = undoProblem(stack, seen, payload.voids_event_id);
      if (problem) throw new LineupError(`${UNDO_MESSAGES[problem]}: ${payload.voids_event_id}`);
      stack.pop();
    } else {
      stack.push(record);
    }
    seen.set(record.id, payload.type === "undo");
  }
  return stack;
}

/** El último movimiento vigente: el único que se puede deshacer. */
export function lineupUndoTarget<T extends LineupRecordLike>(records: readonly T[]): T | null {
  return effectiveLineup(records).at(-1) ?? null;
}

/** Reproduce la alineación sin lo deshecho. */
export function replayRecords(records: readonly LineupRecordLike[]): LineupState {
  const events = effectiveLineup(records).flatMap(({ payload }) =>
    payload.type === "undo" ? [] : [payload],
  );
  return replay(events);
}

/**
 * Aplica varios cambios con el mismo tiempo, en orden. Si alguno es imposible no se aplica
 * ninguno. Un jugador no puede aparecer en dos pares (saldría con un tramo de 0 segundos).
 */
export function applySubstitutions(
  state: LineupState,
  t: number,
  pairs: readonly SubstitutionPair[],
): LineupState {
  if (pairs.length === 0) throw new LineupError("No hay ningún cambio");
  const players = pairs.flatMap((pair) => [pair.out, pair.in]);
  if (new Set(players).size !== players.length) {
    throw new LineupError("Un jugador está en más de un cambio");
  }
  return pairs.reduce(
    (current, pair) => substitute(current, t, pair.out, pair.in),
    state,
  );
}
