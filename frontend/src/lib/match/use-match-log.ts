import { useCallback, useEffect, useRef, useState } from "react";

import type { LineupEventRecord, LoggedEvent, RatingIn } from "@/lib/api/match-types";
import { ApiError } from "@/lib/api/client";
import { syncMatch } from "@/lib/api/matches";

import type { EventKind } from "./events";
import { newId } from "@/lib/ids";
import type { LineupEvent, LineupPayload } from "./lineup";
import {
  confirmedOf,
  dropRejected,
  EMPTY_OUTBOX,
  idsOf,
  plus,
  restoreOutbox,
  size,
  toEventIn,
  without,
  type ConfirmedLog,
  type Outbox,
} from "./outbox";
import { saveOutbox } from "./outbox-store";
import { loadRejections, saveRejections } from "./rejections";
import { nextSeq } from "./sequence";
import { chooseUndo, undoTargetId, type UndoAction } from "./undo";

const RETRY_EVERY_MS = 5000;
/**
 * Tras un rechazo del envío entero ("stalled") también se reintenta solo, pero despacio: un dato
 * inválido no se arregla reenviándolo, pero la cola nunca debe quedarse parada para siempre.
 */
export const STALLED_RETRY_MS = 45_000;
const SERVER_ERROR_FROM = 500;
/** «Envío simultáneo; vuelve a intentarlo»: otro envío del mismo partido ganó la carrera. */
const CONCURRENT_SYNC = 409;
/** Límite de peticiones del servidor: pasa solo esperando. */
const TOO_MANY_REQUESTS = 429;
/** Un envío sin respuesta en este tiempo se corta y se reintenta como un corte de red. */
export const SYNC_TIMEOUT_MS = 15_000;
// Solo un choque de `seq` o de id con otro dispositivo bloquea: la base local ya no es fiable.
const CONFLICT_REASONS = ["seq_conflict", "id_conflict"];

/** "stalled": el servidor rechazó el envío entero; se puede seguir anotando y reintentar. */
export type LogStatus = "synced" | "pending" | "offline" | "conflict" | "stalled";

/** Algo anotado que el servidor rechazó y ya no está en el registro local. */
/** Motivo propio (no del servidor): el movimiento pendiente dependía de algo rechazado. */
export const DEPENDS_ON_REJECTED = "depends_on_rejected";

export interface Rejection {
  id: string;
  reason: string;
  event?: LoggedEvent;
  lineup?: LineupEventRecord;
  rating?: RatingIn;
}

export interface NewEvent {
  kind: EventKind;
  part: number;
  t: number;
  player_id?: string | null;
  /** Solo en "undo": el evento que deshace. */
  voids_event_id?: string | null;
}

interface Options {
  matchId: string;
  initialLineup: readonly LineupEventRecord[];
  initialEvents: readonly LoggedEvent[];
  /** Lo que quedó sin confirmar la última vez (guardado en el dispositivo). */
  savedOutbox?: Outbox;
  /** La lectura de lo guardado ya falló al cargar: se avisa de que no hay copia local. */
  storageFailed?: boolean;
  /**
   * Se llama tras cada envío aceptado con lo que el servidor ya tiene (sin lo pendiente). Los
   * avisos se atienden de uno en uno y en orden; si falla, el registro sigue como si nada.
   */
  onConfirmed?: (log: ConfirmedLog) => Promise<void> | void;
  /** Límite de espera de cada envío (por defecto, `SYNC_TIMEOUT_MS`). */
  syncTimeoutMs?: number;
  /** Cada cuánto se reintenta tras un rechazo del envío entero (por defecto, `STALLED_RETRY_MS`). */
  stalledRetryMs?: number;
}

export interface MatchLog {
  lineup: readonly LineupEventRecord[];
  events: readonly LoggedEvent[];
  /** Cuántos elementos esperan a llegar al servidor. */
  pending: number;
  status: LogStatus;
  /** Qué falló cuando el estado es "conflict" o "stalled". */
  problem: string | null;
  /** Lo que deshace `undoLast` (null si no hay nada que deshacer). */
  undoable: UndoAction | null;
  /** Lo rechazado por el servidor desde el último `dismissRejections`. */
  rejections: readonly Rejection[];
  dismissRejections: () => void;
  /** Sube con cada anotación: permite saber si algo cambió mientras se recargaba. */
  revision: number;
  /** No se pudo guardar en el dispositivo: si se cierra la pestaña, lo pendiente se pierde. */
  storageFailed: boolean;
  recordLineup: (payload: LineupEvent) => LineupEventRecord;
  recordEvent: (event: NewEvent) => LoggedEvent;
  recordRating: (part: number, t: number, stars: number) => void;
  /**
   * Deshace lo último. Con `expectedId` (lo que se mostró al pedir confirmación), solo si lo último
   * sigue siendo eso; si cambió entretanto no hace nada. Devuelve si se deshizo algo.
   */
  undoLast: (expectedId?: string) => boolean;
  flush: () => Promise<void>;
}

/**
 * Se reintenta como un corte de red lo que puede pasar solo: sin red, sin respuesta a tiempo, una
 * respuesta que no es de la API (cuerpo cortado, la página de un portal cautivo), un envío
 * simultáneo, el límite de peticiones o un 5xx. El resto (400, 422…) es un rechazo del dato.
 */
function isRetryable(failure: unknown): boolean {
  if (!(failure instanceof ApiError)) return true;
  return (
    failure.code === "network" ||
    failure.code === "timeout" ||
    failure.code === "bad_response" ||
    failure.status === CONCURRENT_SYNC ||
    failure.status === TOO_MANY_REQUESTS ||
    failure.status >= SERVER_ERROR_FROM
  );
}

/** Qué era cada id rechazado, buscándolo en lo que se envió. */
function describeRejected(
  batch: Outbox,
  events: readonly LoggedEvent[],
  rejected: readonly { id: string; reason: string }[],
): Rejection[] {
  return rejected.map(({ id, reason }) => ({
    id,
    reason,
    event: events.find((item) => item.id === id),
    lineup: batch.lineup.find((item) => item.id === id),
    rating: batch.ratings.find((item) => item.id === id),
  }));
}


/**
 * Registro del partido: lo anotado aparece al instante y se envía en segundo plano. Lo que no
 * llega se conserva y se reenvía con los mismos ids (el servidor es idempotente). Cada cambio de la
 * bandeja se copia a IndexedDB, así que sobrevive a recargas y a que el sistema mate la pestaña.
 */
export function useMatchLog({
  matchId,
  initialLineup,
  initialEvents,
  savedOutbox = EMPTY_OUTBOX,
  storageFailed: storageFailedOnLoad = false,
  onConfirmed,
  syncTimeoutMs = SYNC_TIMEOUT_MS,
  stalledRetryMs = STALLED_RETRY_MS,
}: Options): MatchLog {
  const [restored] = useState(() => restoreOutbox(savedOutbox, initialLineup, initialEvents));
  const [lineup, setLineup] = useState(restored.lineup);
  const [events, setEvents] = useState(restored.events);
  const [pending, setPending] = useState(size(restored.outbox));
  const [failed, setFailed] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Lo rechazado y sin atender viene de lo guardado: el aviso no se pierde con una recarga.
  const [rejections, setRejections] = useState<readonly Rejection[]>(() => loadRejections(matchId));
  const [undoable, setUndoable] = useState(() =>
    chooseUndo(restored.lineup, restored.events, new Map()),
  );
  const [revision, setRevision] = useState(0);
  const [storageFailed, setStorageFailed] = useState(storageFailedOnLoad);

  const lineupRef = useRef(restored.lineup);
  const eventsRef = useRef(restored.events);
  const outbox = useRef<Outbox>(restored.outbox);
  // Ids que han salido en alguna petición sin respuesta: pudieron llegar al servidor aunque
  // la respuesta se perdiera, así que ya no se pueden dar por "no enviados". Lo recuperado del
  // dispositivo cuenta igual: no se sabe si llegó antes de que se perdiera la pestaña.
  const maybeSent = useRef<Set<string>>(new Set(restored.recovered));
  const flushing = useRef(false);
  // Tras un conflicto no se sigue enviando sobre una base inconsistente: hay que recargar.
  const blocked = useRef(false);
  // Los guardados van en cola para que, aunque terminen en otro orden, gane siempre el último.
  const writes = useRef<Promise<void>>(Promise.resolve());
  // Lo que el servidor ya confirmó pero aún no está en la copia local. Se sigue guardando en la
  // bandeja del disco hasta que la copia lo recoja: si la pestaña muriera entre medias, al reabrir
  // sin red faltaría en las dos partes y se repetirían números de secuencia (seq_conflict).
  const retained = useRef<Outbox>(EMPTY_OUTBOX);
  // Orden de lo anotado en esta sesión entre los dos flujos (eventos y alineación), para saber qué
  // fue lo último. Lo que vino ya guardado se ordena por parte y tiempo (ver `chooseUndo`).
  const order = useRef<Map<string, number>>(new Map());
  const counter = useRef(0);

  /** Publica la vista tras cambiar las referencias del registro. */
  const publish = useCallback(() => {
    setLineup(lineupRef.current);
    setEvents(eventsRef.current);
    setUndoable(chooseUndo(lineupRef.current, eventsRef.current, order.current));
    setRevision((value) => value + 1);
  }, []);

  const persist = useCallback(
    (next: Outbox) => {
      writes.current = writes.current
        .then(() => saveOutbox(matchId, plus(next, retained.current)))
        .catch(() => setStorageFailed(true));
    },
    [matchId],
  );

  // La copia local de lo confirmado también va en cola, aparte de la de la bandeja.
  const confirmedWrites = useRef<Promise<void>>(Promise.resolve());
  const onConfirmedRef = useRef(onConfirmed);
  useEffect(() => {
    onConfirmedRef.current = onConfirmed;
  }, [onConfirmed]);

  const releaseRetained = useCallback(
    (covered: ReadonlySet<string>) => {
      if (covered.size === 0) return;
      retained.current = without(retained.current, covered);
      persist(outbox.current);
    },
    [persist],
  );

  const notifyConfirmed = useCallback(() => {
    const log = confirmedOf(lineupRef.current, eventsRef.current, outbox.current);
    const covered = idsOf(retained.current);
    confirmedWrites.current = confirmedWrites.current
      .then(() => onConfirmedRef.current?.(log))
      .then(() => releaseRetained(covered))
      // La copia es un respaldo para abrir sin red: si no se guarda, anotar y enviar siguen igual,
      // y lo retenido se libera con la próxima copia que sí se guarde.
      .catch(() => undefined);
  }, [releaseRetained]);

  const commit = useCallback(
    (next: Outbox) => {
      outbox.current = next;
      setPending(size(next));
      persist(next);
    },
    [persist],
  );

  const sendWithTimeout = useCallback(
    async (batch: Outbox) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), syncTimeoutMs);
      try {
        return await syncMatch(
          matchId,
          { events: [...batch.events], lineup_events: [...batch.lineup], ratings: [...batch.ratings] },
          { signal: controller.signal },
        );
      } finally {
        clearTimeout(timer);
      }
    },
    [matchId, syncTimeoutMs],
  );

  /** Quita lo rechazado (y lo que dependía de ello) y lo deja anotado en el aviso. */
  const discardRejected = useCallback(
    (batch: Outbox, rejected: readonly { id: string; reason: string }[]): ReadonlySet<string> => {
      if (rejected.length === 0) return new Set();
      const entries = describeRejected(batch, eventsRef.current, rejected);
      const ids = new Set(rejected.map((item) => item.id));
      const next = dropRejected(lineupRef.current, eventsRef.current, outbox.current, ids, idsOf(batch));
      const dependent = next.impossible.map(
        (lineup): Rejection => ({ id: lineup.id, reason: DEPENDS_ON_REJECTED, lineup }),
      );
      lineupRef.current = next.lineup;
      eventsRef.current = next.events;
      next.dropped.forEach((id) => order.current.delete(id));
      commit(next.outbox);
      publish();
      setRejections((previous) => [...previous, ...entries, ...dependent]);
      return next.dropped;
    },
    [commit, publish],
  );

  const flush = useCallback(async () => {
    if (flushing.current || blocked.current || size(outbox.current) === 0) return;
    flushing.current = true;
    try {
      while (size(outbox.current) > 0) {
        const batch = outbox.current;
        const ids = idsOf(batch);
        ids.forEach((id) => maybeSent.current.add(id));
        const result = await sendWithTimeout(batch);
        ids.forEach((id) => maybeSent.current.delete(id));
        if (result.rejected.some((item) => CONFLICT_REASONS.includes(item.reason))) {
          commit(without(outbox.current, ids));
          blocked.current = true;
          setConflict(true);
          setProblem("Conflicto con otro dispositivo");
          return;
        }
        const removed = discardRejected(batch, result.rejected);
        if (onConfirmedRef.current) {
          retained.current = plus(retained.current, without({ ...batch, ratings: [] }, removed));
        }
        commit(without(outbox.current, ids));
        notifyConfirmed();
      }
      setFailed(false);
      setStalled(false);
      setProblem(null);
    } catch (failure) {
      // Solo uno de los dos reintentos automáticos a la vez: el rápido (5 s) o el lento (45 s).
      if (isRetryable(failure)) {
        setStalled(false);
        setProblem(null);
        setFailed(true);
      } else {
        // El lote entero no vale: se avisa y se reintenta con el botón, al anotar lo siguiente o,
        // despacio, solo.
        const message = failure instanceof ApiError ? failure.message : "error";
        setFailed(false);
        setStalled(true);
        setProblem(`El servidor rechazó el envío (${message})`);
      }
    } finally {
      flushing.current = false;
    }
  }, [commit, notifyConfirmed, sendWithTimeout, discardRejected]);

  // Se espera un instante para que lo anotado a la vez viaje en un solo envío.
  const scheduleFlush = useCallback(() => {
    void Promise.resolve().then(flush);
  }, [flush]);

  const remember = useCallback((id: string) => {
    counter.current += 1;
    order.current.set(id, counter.current);
  }, []);

  const appendLineup = useCallback(
    (payload: LineupPayload): LineupEventRecord => {
      const record: LineupEventRecord = {
        id: newId(),
        seq: nextSeq(lineupRef.current),
        payload,
      };
      lineupRef.current = [...lineupRef.current, record];
      remember(record.id);
      publish();
      commit({ ...outbox.current, lineup: [...outbox.current.lineup, record] });
      scheduleFlush();
      return record;
    },
    [commit, scheduleFlush, publish, remember],
  );

  const recordLineup = useCallback(
    (payload: LineupEvent): LineupEventRecord => appendLineup(payload),
    [appendLineup],
  );

  const recordEvent = useCallback(
    (input: NewEvent): LoggedEvent => {
      const event: LoggedEvent = {
        id: newId(),
        seq: nextSeq(eventsRef.current),
        kind: input.kind,
        part: input.part,
        t: input.t,
        player_id: input.player_id ?? null,
        voids_event_id: input.voids_event_id ?? null,
      };
      eventsRef.current = [...eventsRef.current, event];
      remember(event.id);
      publish();
      commit({ ...outbox.current, events: [...outbox.current.events, toEventIn(event)] });
      scheduleFlush();
      return event;
    },
    [commit, scheduleFlush, publish, remember],
  );

  const recordRating = useCallback(
    (part: number, t: number, stars: number) => {
      const rating: RatingIn = { id: newId(), part, t, stars };
      setRevision((value) => value + 1);
      commit({ ...outbox.current, ratings: [...outbox.current.ratings, rating] });
      scheduleFlush();
    },
    [commit, scheduleFlush],
  );

  /** Nunca llegó al servidor: basta con quitarlo, sin dejar un evento compensatorio. */
  const dropUnsent = useCallback(
    (id: string): boolean => {
      const queued = [...outbox.current.events, ...outbox.current.lineup].some((e) => e.id === id);
      if (!queued || maybeSent.current.has(id)) return false;
      eventsRef.current = eventsRef.current.filter((e) => e.id !== id);
      lineupRef.current = lineupRef.current.filter((e) => e.id !== id);
      order.current.delete(id);
      commit(without(outbox.current, new Set([id])));
      publish();
      return true;
    },
    [commit, publish],
  );

  const undoLast = useCallback((expectedId?: string): boolean => {
    const action = chooseUndo(lineupRef.current, eventsRef.current, order.current);
    if (!action || action.kind === "blocked") return false;
    if (expectedId !== undefined && undoTargetId(action) !== expectedId) return false;
    if (action.kind === "lineup" || action.kind === "red") {
      const { id } = action.record;
      if (!dropUnsent(id)) appendLineup({ type: "undo", voids_event_id: id });
    }
    if (action.kind === "event" || action.kind === "red") {
      const target = action.event;
      if (!dropUnsent(target.id)) {
        recordEvent({ kind: "undo", part: target.part, t: target.t, voids_event_id: target.id });
      }
    }
    return true;
  }, [appendLineup, dropUnsent, recordEvent]);

  const dismissRejections = useCallback(() => setRejections([]), []);

  // Cada cambio del aviso se copia al dispositivo; atenderlo (lista vacía) borra la copia.
  useEffect(() => {
    saveRejections(matchId, rejections);
  }, [matchId, rejections]);

  useEffect(() => {
    // Lo recuperado del dispositivo se limpia de lo que el servidor ya tenía y se envía el resto.
    if (size(savedOutbox) > 0) persist(outbox.current);
    void flush();
    // Solo al montar: el tablero se vuelve a crear en cada carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const retry = () => void flush();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [flush]);

  useEffect(() => {
    if (!failed || pending === 0) return;
    const timer = setInterval(() => void flush(), RETRY_EVERY_MS);
    return () => clearInterval(timer);
  }, [failed, pending, flush]);

  useEffect(() => {
    if (!stalled || pending === 0) return;
    const timer = setInterval(() => void flush(), stalledRetryMs);
    return () => clearInterval(timer);
  }, [stalled, pending, flush, stalledRetryMs]);

  let status: LogStatus = "synced";
  if (conflict) status = "conflict";
  else if (stalled) status = "stalled";
  else if (pending > 0) status = failed ? "offline" : "pending";

  return {
    lineup,
    events,
    pending,
    status,
    problem,
    undoable,
    rejections,
    dismissRejections,
    revision,
    storageFailed,
    recordLineup, recordEvent, recordRating,
    undoLast,
    flush,
  };
}
