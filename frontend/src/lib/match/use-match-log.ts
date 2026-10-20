import { useCallback, useEffect, useRef, useState } from "react";

import type {
  EventIn,
  LineupEventRecord,
  LoggedEvent,
  RatingIn,
} from "@/lib/api/match-types";
import { ApiError } from "@/lib/api/client";
import { syncMatch } from "@/lib/api/matches";

import { undoTarget, type EventKind } from "./events";
import { newId } from "./ids";
import type { LineupEvent } from "./lineup";
import { nextSeq } from "./sequence";

const RETRY_EVERY_MS = 5000;
const SERVER_ERROR_FROM = 500;
const CONFLICT_REASONS = ["seq_conflict", "id_conflict"];

interface Outbox {
  lineup: readonly LineupEventRecord[];
  events: readonly EventIn[];
  ratings: readonly RatingIn[];
}

const EMPTY_OUTBOX: Outbox = { lineup: [], events: [], ratings: [] };

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
  recordLineup: (payload: LineupEvent) => LineupEventRecord;
  recordEvent: (event: NewEvent) => LoggedEvent;
  recordRating: (part: number, t: number, stars: number) => void;
  undoLast: () => void;
  flush: () => Promise<void>;
}

function size(outbox: Outbox): number {
  return outbox.lineup.length + outbox.events.length + outbox.ratings.length;
}

function idsOf(outbox: Outbox): Set<string> {
  return new Set([...outbox.lineup, ...outbox.events, ...outbox.ratings].map((item) => item.id));
}

function without(outbox: Outbox, ids: ReadonlySet<string>): Outbox {
  return {
    lineup: outbox.lineup.filter((item) => !ids.has(item.id)),
    events: outbox.events.filter((item) => !ids.has(item.id)),
    ratings: outbox.ratings.filter((item) => !ids.has(item.id)),
  };
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

function toEventIn(event: LoggedEvent): EventIn {
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

/**
 * Registro del partido: lo anotado aparece al instante y se envía en segundo plano. Lo que no
 * llega se conserva y se reenvía con los mismos ids (el servidor es idempotente). Es la pieza que
 * la fase 9 (sin red) sustituirá por almacenamiento local.
 */
export function useMatchLog({ matchId, initialLineup, initialEvents }: Options): MatchLog {
  const [lineup, setLineup] = useState(initialLineup);
  const [events, setEvents] = useState(initialEvents);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const lineupRef = useRef(initialLineup);
  const eventsRef = useRef(initialEvents);
  const outbox = useRef<Outbox>(EMPTY_OUTBOX);
  // Ids que han salido en alguna petición sin respuesta: pudieron llegar al servidor aunque
  // la respuesta se perdiera, así que ya no se pueden dar por "no enviados".
  const maybeSent = useRef<Set<string>>(new Set());
  const flushing = useRef(false);
  // Tras un conflicto no se sigue enviando sobre una base inconsistente: hay que recargar.
  const blocked = useRef(false);

  const commit = useCallback((next: Outbox) => {
    outbox.current = next;
    setPending(size(next));
  }, []);

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
    recordLineup, recordEvent, recordRating,
    undoLast,
    flush,
  };
}
