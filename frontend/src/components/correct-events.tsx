"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { GoalDetailDialog } from "@/components/goal-detail-dialog";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import type { LoggedEvent } from "@/lib/api/match-types";
import { listMatchEvents, setGoalDetail, syncMatch } from "@/lib/api/matches";
import { describeEvent } from "@/lib/labels";
import { elapsedToDisplay, formatClock, type ClockSettings } from "@/lib/match/clock";
import { effectiveEvents } from "@/lib/match/events";
import { describeGoalDetail, detailOf, type GoalDetail } from "@/lib/match/goal-detail";
import { newId } from "@/lib/ids";
import { nextSeq } from "@/lib/match/sequence";

const OFFLINE_ERROR = "Sin conexión. No se pudo deshacer; inténtalo de nuevo.";
const DETAIL_ERROR = "No se pudo guardar el detalle del gol. Inténtalo de nuevo.";
const GOAL_KINDS = new Set(["goal", "rival_goal"]);
const UNDO_ERROR = "No se pudo deshacer. Inténtalo de nuevo.";
const SEQ_CONFLICT =
  "Se anotaron eventos desde otro dispositivo. Se ha recargado la lista; vuelve a intentarlo.";

const REASONS: Record<string, string> = {
  void_target_missing: "No se pudo deshacer: ese evento ya no existe.",
  void_of_undo: "No se pudo deshacer: no se puede deshacer un deshacer.",
  seq_conflict: SEQ_CONFLICT,
};

/** Un deshacer de algo ya deshecho es el resultado buscado: no es un error. */
function rejectionMessage(reason: string): string | null {
  if (reason === "already_voided") return null;
  return REASONS[reason] ?? `No se pudo deshacer: el servidor lo rechazó (${reason}).`;
}

interface UndoEvent {
  id: string;
  seq: number;
  kind: "undo";
  part: number;
  t: number;
  player_id: null;
  voids_event_id: string;
}

interface CorrectEventsProps {
  matchId: string;
  nameOf: (playerId: string) => string;
  settings: ClockSettings;
}

export function CorrectEvents({ matchId, nameOf, settings }: CorrectEventsProps) {
  const [events, setEvents] = useState<LoggedEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  // Gol cuyo detalle (tipo y punto) se está completando.
  const [detailing, setDetailing] = useState<LoggedEvent | null>(null);
  const [savingDetail, setSavingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const locked = useRef(false);
  // Mismo id y seq al reintentar: si el envío llegó pero se perdió la respuesta, el servidor
  // lo reconoce como duplicado en vez de rechazarlo.
  const attempts = useRef(new Map<string, UndoEvent>());

  useEffect(() => {
    let active = true;
    listMatchEvents(matchId)
      .then((loaded) => {
        if (!active) return;
        setEvents(loaded);
        setFailed(false);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [matchId, reloadKey]);

  const reload = useCallback(() => {
    setFailed(false);
    setReloadKey((key) => key + 1);
  }, []);

  async function undo(target: LoggedEvent) {
    if (locked.current || events === null) return;
    locked.current = true;
    setUndoError(null);
    const undoEvent: UndoEvent = attempts.current.get(target.id) ?? {
      id: newId(),
      seq: nextSeq(events),
      kind: "undo",
      part: target.part,
      t: target.t,
      player_id: null,
      voids_event_id: target.id,
    };
    attempts.current.set(target.id, undoEvent);
    try {
      const result = await syncMatch(matchId, { events: [undoEvent] });
      const stored = result.accepted.includes(undoEvent.id) || result.duplicates.includes(undoEvent.id);
      if (stored) {
        // Se refleja ya, para que un segundo deshacer rápido no reutilice la misma secuencia.
        setEvents((current) => (current ? [...current, undoEvent] : current));
      } else {
        setUndoError(rejectionMessage(result.rejected[0]?.reason ?? "rechazado"));
      }
      attempts.current.delete(target.id);
    } catch (failure) {
      const offline = failure instanceof ApiError && failure.code === "network";
      setUndoError(offline ? OFFLINE_ERROR : UNDO_ERROR);
    } finally {
      locked.current = false;
      setConfirmingId(null);
      // Aunque falle, puede haber llegado: se vuelve a mirar el estado real.
      reload();
    }
  }

  async function saveDetail(detail: GoalDetail) {
    if (!detailing) return;
    setSavingDetail(true);
    setDetailError(null);
    try {
      await setGoalDetail(matchId, detailing.id, detail);
      setDetailing(null);
      reload();
    } catch {
      setDetailError(DETAIL_ERROR);
    } finally {
      setSavingDetail(false);
    }
  }

  if (failed) {
    return (
      <div role="alert" className="flex items-center justify-between rounded-lg border p-4">
        <p>No se pudieron cargar los eventos</p>
        <Button variant="outline" onClick={reload}>
          Reintentar
        </Button>
      </div>
    );
  }
  if (events === null) return <p className="text-muted-foreground">Cargando eventos…</p>;

  let current: LoggedEvent[] = [];
  let incoherent = false;
  try {
    const effective = new Set(effectiveEvents(events).map((event) => event.id));
    current = events
      .filter((event) => effective.has(event.id))
      .sort((a, b) => a.part - b.part || a.t - b.t || a.seq - b.seq);
  } catch {
    incoherent = true;
  }

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">Eventos</h2>
      {undoError ? (
        <p role="alert" className="text-base text-destructive">
          {undoError}
        </p>
      ) : null}
      {incoherent ? (
        <p role="alert" className="text-base text-destructive">
          El registro de eventos no es coherente
        </p>
      ) : null}
      {!incoherent && current.length === 0 ? (
        <p className="text-muted-foreground">No hay eventos anotados</p>
      ) : null}
      <ul aria-label="Eventos" className="space-y-3">
        {current.map((event) => {
          const description = describeEvent(event, nameOf);
          const when = formatClock(elapsedToDisplay(event.t, settings));
          const isGoal = GOAL_KINDS.has(event.kind);
          const goalDetail = isGoal ? describeGoalDetail(detailOf(event), event.kind === "goal") : "";
          return (
            <li key={event.id} className="space-y-2 rounded-2xl border-2 bg-card p-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="min-w-0 flex-1 text-lg">
                  {`${event.part}ª parte · ${when} · ${description}`}
                  {isGoal ? (
                    <span className="block text-sm text-muted-foreground">{goalDetail || "Sin detalle"}</span>
                  ) : null}
                </span>
                {isGoal && confirmingId !== event.id ? (
                  <Button
                    variant="outline"
                    aria-label={`Detalle de ${description}`}
                    onClick={() => {
                      setDetailError(null);
                      setDetailing(event);
                    }}
                  >
                    Detalle
                  </Button>
                ) : null}
                {confirmingId === event.id ? (
                  <span className="flex gap-2">
                    <Button variant="outline" onClick={() => setConfirmingId(null)}>
                      Cancelar
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={(click) => {
                        // Un doble toque accidental no debe confirmar.
                        if (click.detail > 1) return;
                        void undo(event);
                      }}
                    >
                      Confirmar deshacer
                    </Button>
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    aria-label={`Deshacer ${description}`}
                    onClick={() => setConfirmingId(event.id)}
                  >
                    Deshacer
                  </Button>
                )}
              </div>
              {confirmingId === event.id && event.kind === "red" ? (
                <p className="text-sm text-muted-foreground">
                  Deshacer una roja no devuelve al jugador a la pista: si hace falta, corrige sus tramos
                  arriba.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <GoalDetailDialog
        goal={
          detailing
            ? {
                forTeam: detailing.kind === "goal",
                title: describeEvent(detailing, nameOf),
                initial: detailOf(detailing),
              }
            : null
        }
        saveLabel="Guardar detalle"
        saving={savingDetail}
        error={detailError}
        onSave={(detail) => void saveDetail(detail)}
        onClose={() => setDetailing(null)}
      />
    </section>
  );
}
