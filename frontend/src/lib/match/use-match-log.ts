import { useCallback, useEffect, useRef, useState } from "react";

import type { LineupEventRecord, LoggedEvent, RatingIn } from "@/lib/api/match-types";
import { ApiError } from "@/lib/api/client";
import { syncMatch } from "@/lib/api/matches";

import { undoTarget, type EventKind } from "./events";
import { newId } from "@/lib/ids";
import type { LineupEvent } from "./lineup";
import { EMPTY_OUTBOX, idsOf, restoreOutbox, size, toEventIn, without, type Outbox } from "./outbox";
import { saveOutbox } from "./outbox-store";
import { nextSeq } from "./sequence";

const RETRY_EVERY_MS = 5000;
const SERVER_ERROR_FROM = 500;
const CONFLICT_REASONS = ["seq_conflict", "id_conflict"];

export type LogStatus = "synced" | "pending" | "offline" | "conflict";

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
}

export interface MatchLog {
  lineup: readonly LineupEventRecord[];
  events: readonly LoggedEvent[];
  /** Cuántos elementos esperan a llegar al servidor. */
  pending: number;
  status: LogStatus;
  /** Qué falló cuando el estado es "conflict". */
  problem: string | null;
  /** Sube con cada anotación: permite saber si algo cambió mientras se recargaba. */
  revision: number;
  /** No se pudo guardar en el dispositivo: si se cierra la pestaña, lo pendiente se pierde. */
  storageFailed: boolean;
  recordLineup: (payload: LineupEvent) => LineupEventRecord;
  recordEvent: (event: NewEvent) => LoggedEvent;
  recordRating: (part: number, t: number, stars: number) => void;
  undoLast: () => void;
  flush: () => Promise<void>;
}

/** Un corte de red o un 5xx se reintentan; el resto de errores del servidor no mejoran solos. */
function isRetryable(failure: unknown): boolean {
  if (!(failure instanceof ApiError)) return true;
  return failure.code === "network" || failure.status >= SERVER_ERROR_FROM;
}

function conflictMessage(reasons: readonly string[]): string {
  if (reasons.some((reason) => CONFLICT_REASONS.includes(reason))) {
    return "Conflicto con otro dispositivo";
  }
  return `El servidor rechazó lo anotado (${reasons.join(", ")})`;
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
}: Options): MatchLog {
  const [restored] = useState(() => restoreOutbox(savedOutbox, initialLineup, initialEvents));
  const [lineup, setLineup] = useState(restored.lineup);
  const [events, setEvents] = useState(restored.events);
  const [pending, setPending] = useState(size(restored.outbox));
  const [failed, setFailed] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
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

  const persist = useCallback(
    (next: Outbox) => {
      writes.current = writes.current
        .then(() => saveOutbox(matchId, next))
        .catch(() => setStorageFailed(true));
    },
    [matchId],
  );

  const commit = useCallback(
    (next: Outbox) => {
      outbox.current = next;
      setPending(size(next));
      persist(next);
    },
    [persist],
  );

  const flush = useCallback(async () => {
    if (flushing.current || blocked.current || size(outbox.current) === 0) return;
    flushing.current = true;
    try {
      while (size(outbox.current) > 0) {
        const batch = outbox.current;
        const ids = idsOf(batch);
        ids.forEach((id) => maybeSent.current.add(id));
        const result = await syncMatch(matchId, {
          events: [...batch.events],
          lineup_events: [...batch.lineup],
          ratings: [...batch.ratings],
        });
        ids.forEach((id) => maybeSent.current.delete(id));
        commit(without(outbox.current, ids));
        if (result.rejected.length > 0) {
          blocked.current = true;
          setProblem(conflictMessage(result.rejected.map((item) => item.reason)));
          return;
        }
      }
      setFailed(false);
    } catch (failure) {
      if (isRetryable(failure)) {
        setFailed(true);
      } else {
        const message = failure instanceof ApiError ? failure.message : "error";
        blocked.current = true;
        setProblem(`El servidor rechazó lo anotado (${message})`);
      }
    } finally {
      flushing.current = false;
    }
  }, [matchId, commit]);

  // Se espera un instante para que lo anotado a la vez viaje en un solo envío.
  const scheduleFlush = useCallback(() => {
    void Promise.resolve().then(flush);
  }, [flush]);

  const recordLineup = useCallback(
    (payload: LineupEvent): LineupEventRecord => {
      const record: LineupEventRecord = {
        id: newId(),
        seq: nextSeq(lineupRef.current),
        payload,
      };
      lineupRef.current = [...lineupRef.current, record];
      setLineup(lineupRef.current);
      setRevision((value) => value + 1);
      commit({ ...outbox.current, lineup: [...outbox.current.lineup, record] });
      scheduleFlush();
      return record;
    },
    [commit, scheduleFlush],
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
      setEvents(eventsRef.current);
      setRevision((value) => value + 1);
      commit({ ...outbox.current, events: [...outbox.current.events, toEventIn(event)] });
      scheduleFlush();
      return event;
    },
    [commit, scheduleFlush],
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

  const undoLast = useCallback(() => {
    const target = undoTarget(eventsRef.current);
    if (!target) return;
    const unsent =
      outbox.current.events.some((e) => e.id === target.id) && !maybeSent.current.has(target.id);
    if (unsent) {
      // Nunca llegó al servidor: basta con quitarlo, sin dejar un evento compensatorio.
      eventsRef.current = eventsRef.current.filter((e) => e.id !== target.id);
      setEvents(eventsRef.current);
      setRevision((value) => value + 1);
      commit(without(outbox.current, new Set([target.id])));
      return;
    }
    recordEvent({ kind: "undo", part: target.part, t: target.t, voids_event_id: target.id });
  }, [commit, recordEvent]);

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

  let status: LogStatus = "synced";
  if (problem !== null) status = "conflict";
  else if (pending > 0) status = failed ? "offline" : "pending";

  return {
    lineup,
    events,
    pending,
    status,
    problem,
    revision,
    storageFailed,
    recordLineup, recordEvent, recordRating,
    undoLast,
    flush,
  };
}
