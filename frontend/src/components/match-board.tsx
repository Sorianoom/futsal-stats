"use client";

import { useEffect, useMemo, useState } from "react";

import { LivePanel } from "@/components/live-panel";
import { MatchSummary } from "@/components/match-summary";
import { PartBreak } from "@/components/part-break";
import { PlayerActionsDialog } from "@/components/player-actions-dialog";
import { RatingDialog } from "@/components/rating-dialog";
import { StartersPicker } from "@/components/starters-picker";
import { SyncStatus } from "@/components/sync-status";
import { SubstitutionDialog, type SubstitutionAnchor } from "@/components/substitution-dialog";
import { QuickTimeDialog } from "@/components/quick-time-dialog";
import { Button } from "@/components/ui/button";
import { UndoDialog } from "@/components/undo-dialog";
import type { LineupEventRecord, LoggedEvent, Match, StintRecord } from "@/lib/api/match-types";
import type { Player } from "@/lib/api/types";
import { describeEvent } from "@/lib/labels";
import {
  elapsedToDisplay,
  formatClock,
  loadClockSettings,
  suggestElapsed,
  saveClockSettings,
  type ClockSettings,
} from "@/lib/match/clock";
import {
  EventError,
  effectiveEvents,
  score,
  teamFoulsByPart,
  undoTarget,
  type EventKind,
} from "@/lib/match/events";
import {
  LineupError,
  applyEvent,
  onCourt,
  replay,
  type LineupEvent,
  type LineupState,
} from "@/lib/match/lineup";
import type { ConfirmedLog, Outbox } from "@/lib/match/outbox";
import { useMatchLog } from "@/lib/match/use-match-log";
import { useWakeLock } from "@/lib/use-wake-lock";

export interface BoardData {
  match: Match;
  lineup: LineupEventRecord[];
  events: LoggedEvent[];
  /** Tramos ya guardados: si hay, el partido está cerrado. */
  stints: StintRecord[];
  players: Player[];
  proposed: string[];
  /** Lo anotado y sin confirmar que quedó guardado en este dispositivo. */
  savedOutbox: Outbox;
  /** No se pudo leer lo guardado en el dispositivo. */
  storageFailed: boolean;
  /** Si viene de la copia local (sin red): cuándo se guardó, en ms desde 1970. */
  staleSince?: number;
}

type Replayed = { state: LineupState } | { error: string };

/** Hora real en ms. Solo se llama desde manejadores de eventos, nunca al pintar. */
function realNow(): number {
  return Date.now();
}

function replayLineup(lineup: readonly LineupEventRecord[]): Replayed {
  try {
    return { state: replay(lineup.map((event) => event.payload)) };
  } catch (failure) {
    if (failure instanceof LineupError) return { error: "La alineación guardada no es válida" };
    throw failure;
  }
}

/** Lo que se espera del marcador antes de anotar, según la acción en curso. */
type Pending =
  | { type: "goal"; playerId: string }
  | { type: "red"; playerId: string }
  | { type: "rival_goal" }
  | { type: "sub"; out: string; in: string }
  | { type: "end" }
  | { type: "clock" };

const TITLES: Record<Pending["type"], string> = {
  goal: "Gol",
  red: "Roja",
  rival_goal: "Gol rival",
  sub: "Cambio",
  end: "Fin de la parte",
  clock: "Tiempo del marcador",
};

export interface BoardActivity {
  /** Sin nada a medias ni sin enviar: es seguro sustituir el tablero por datos del servidor. */
  idle: boolean;
  revision: number;
  pending: number;
}

interface MatchBoardProps {
  matchId: string;
  data: BoardData;
  /** Recarga pedida a propósito (descarta lo local). */
  onReload: () => void;
  /** Recarga al volver a la pestaña: solo se aplica si no cambió nada entretanto. */
  onRefresh: () => void;
  onActivity: (activity: BoardActivity) => void;
  /** Lo que el servidor tiene tras cada envío aceptado: base de la copia local. */
  onConfirmed?: (log: ConfirmedLog) => Promise<void> | void;
}

const BLOCKED = "Recarga el partido antes de seguir";

export function MatchBoard({ matchId, data, onReload, onRefresh, onActivity, onConfirmed }: MatchBoardProps) {
  const log = useMatchLog({
    matchId,
    initialLineup: data.lineup,
    initialEvents: data.events,
    savedOutbox: data.savedOutbox,
    storageFailed: data.storageFailed,
    onConfirmed,
  });
  const [settings, setSettings] = useState<ClockSettings>(() => loadClockSettings());
  // Último tiempo anotado en la parte en juego: se reutiliza en lo que se anota con un toque.
  // `at` es la hora real (Date.now) de ese tiempo: con ella se estima por dónde va el marcador.
  const [memo, setMemo] = useState<{ part: number; t: number; at: number | null }>({
    part: 0,
    t: 0,
    at: null,
  });
  const [suggested, setSuggested] = useState(0);
  const [sheetPlayer, setSheetPlayer] = useState<Player | null>(null);
  const [anchor, setAnchor] = useState<SubstitutionAnchor | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [rating, setRating] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const replayed = useMemo(() => replayLineup(log.lineup), [log.lineup]);
  const state = "state" in replayed ? replayed.state : null;
  const part = state?.currentPart ?? null;
  const lastEventT = useMemo(
    () =>
      log.events
        .filter((event) => event.part === part && event.kind !== "undo")
        .reduce((latest, event) => Math.max(latest, event.t), 0),
    [log.events, part],
  );
  const clock = state?.clock ?? 0;
  // Tras recargar no hay "último tecleado": se parte del último evento o cambio guardado.
  const now = memo.part === part ? Math.max(memo.t, clock) : Math.max(clock, lastEventT);

  const names = new Map(data.players.map((player) => [player.id, player]));
  const nameOf = (playerId: string) => names.get(playerId)?.name ?? "Jugador desconocido";
  const eventsProblem = useMemo(() => {
    try {
      effectiveEvents(log.events);
      return null;
    } catch (failure) {
      return failure instanceof EventError ? failure.message : "error";
    }
  }, [log.events]);
  const target = useMemo(() => (eventsProblem ? null : undoTarget(log.events)), [log.events, eventsProblem]);

  const idle =
    log.pending === 0 &&
    log.status !== "conflict" &&
    pending === null &&
    sheetPlayer === null &&
    anchor === null &&
    !rating &&
    !undoing;

  useEffect(() => {
    onActivity({ idle, revision: log.revision, pending: log.pending });
  }, [onActivity, idle, log.revision, log.pending]);

  // En el iPad la pantalla se apagaría en plena jugada: se mantiene encendida mientras el partido siga abierto.
  useWakeLock(data.stints.length === 0);

  // Safari del iPad descarta y reactiva pestañas: al volver se pide de nuevo el estado real,
  // pero nunca con algo a medias ni con cosas sin enviar.
  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState === "visible" && idle) onRefresh();
    }
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => document.removeEventListener("visibilitychange", refreshWhenVisible);
  }, [idle, onRefresh]);

  // El registro vive en memoria hasta la fase de modo sin red: cerrar con algo pendiente lo pierde.
  useEffect(() => {
    if (log.pending === 0) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [log.pending]);

  function blockedByConflict(): boolean {
    if (log.status !== "conflict") return false;
    setProblem(BLOCKED);
    return true;
  }

  function tryLineup(event: LineupEvent): boolean {
    if (!state || blockedByConflict()) return false;
    try {
      applyEvent(state, event);
    } catch (failure) {
      if (!(failure instanceof LineupError)) throw failure;
      setProblem(failure.message);
      return false;
    }
    setProblem(null);
    log.recordLineup(event);
    return true;
  }

  /** Abre el diálogo de tiempo proponiendo el tiempo estimado del marcador. */
  function ask(action: Pending) {
    setSuggested(
      suggestElapsed({
        lastElapsed: now,
        lastAt: memo.part === part ? memo.at : null,
        nowMs: realNow(),
        maxElapsed: settings.partSeconds,
      }),
    );
    setPending(action);
  }

  function confirmTime(elapsed: number) {
    if (!pending || part === null) return;
    if (blockedByConflict()) {
      setPending(null);
      return;
    }
    const accepted = commit(pending, part, elapsed);
    if (accepted) setMemo({ part, t: elapsed, at: realNow() });
    setPending(null);
  }

  function commit(action: Pending, currentPart: number, t: number): boolean {
    switch (action.type) {
      case "goal":
        log.recordEvent({ kind: "goal", part: currentPart, t, player_id: action.playerId });
        return true;
      case "rival_goal":
        log.recordEvent({ kind: "rival_goal", part: currentPart, t });
        return true;
      case "red":
        if (!tryLineup({ type: "sent_off", t, player_id: action.playerId })) return false;
        log.recordEvent({ kind: "red", part: currentPart, t, player_id: action.playerId });
        return true;
      case "sub":
        return tryLineup({ type: "substituted", t, player_out: action.out, player_in: action.in });
      case "end":
        return tryLineup({ type: "part_ended", t });
      case "clock":
        return true;
    }
  }

  /** Se anota con un toque, con el último tiempo del marcador. */
  function recordQuick(kind: EventKind, player: Player) {
    if (part === null || blockedByConflict()) return;
    log.recordEvent({ kind, part, t: now, player_id: player.id });
  }

  function quick(kind: EventKind) {
    if (sheetPlayer) recordQuick(kind, sheetPlayer);
    setSheetPlayer(null);
  }

  function toggleDirection() {
    const next: ClockSettings = {
      ...settings,
      direction: settings.direction === "down" ? "up" : "down",
    };
    setSettings(next);
    saveClockSettings(next);
  }

  function pickCandidate(candidate: Player) {
    if (!anchor) return;
    const [out, entering] =
      anchor.side === "court" ? [anchor.player, candidate] : [candidate, anchor.player];
    setAnchor(null);
    ask({ type: "sub", out: out.id, in: entering.id });
  }

  if (!state) {
    return (
      <div role="alert" className="flex items-center justify-between rounded-lg border p-4">
        <p className="text-destructive">{"error" in replayed ? replayed.error : ""}</p>
        <Button variant="outline" onClick={onReload}>
          Recargar
        </Button>
      </div>
    );
  }

  const alerts = (
    <>
      {problem ? (
        <p role="alert" className="mb-4 rounded-lg border p-3 text-destructive">
          {problem}
        </p>
      ) : null}
      {eventsProblem ? (
        <div role="alert" className="mb-4 flex items-center justify-between rounded-lg border p-3">
          <p className="text-destructive">El registro de eventos no es coherente ({eventsProblem})</p>
          <Button variant="outline" onClick={onReload}>
            Recargar
          </Button>
        </div>
      ) : null}
    </>
  );

  const inSetup = state.currentPart === null && state.lastEndedPart === 0;
  if (inSetup) {
    return (
      <StartersPicker
        part={1}
        players={data.players}
        capacity={5}
        proposed={data.proposed}
        busy={false}
        error={problem}
        onStart={(starters) => void tryLineup({ type: "part_started", part: 1, starters })}
      />
    );
  }

  const finished = state.currentPart === null && state.lastEndedPart >= 2;
  const inBreak = state.currentPart === null && state.lastEndedPart === 1;
  if (inBreak || finished) {
    const blockedPlayers = new Set(state.sentOff);
    const lastPart = state.lastEndedPart;
    const available = data.players.filter(
      (p) => !blockedPlayers.has(p.id) && p.status === "available",
    );
    return (
      <div className="space-y-6">
        {alerts}
        <SyncStatus
          status={log.status}
          pending={log.pending}
          detail={log.problem}
          onRetry={() => void log.flush()}
          onReload={onReload}
        />
        {inBreak ? (
          <PartBreak
            part={lastPart + 1}
            score={safeSummary(log.events, null).score}
            players={available}
            capacity={Math.min(5 - state.sentOff.length, available.length)}
            proposed={courtAtEndOfLastPart(log.lineup)}
            error={problem}
            onStart={(starters) =>
              void tryLineup({ type: "part_started", part: lastPart + 1, starters })
            }
          />
        ) : (
          <MatchSummary
            match={data.match}
            players={data.players}
            stints={state.closed}
            score={safeSummary(log.events, null).score}
            reds={effectiveReds(log.events)}
            alreadyClosed={data.stints.length > 0}
            pending={log.pending}
            blocked={log.status === "conflict"}
          />
        )}
      </div>
    );
  }

  const onPitch = new Set(onCourt(state));
  const blocked = new Set(state.sentOff);
  const court = data.players.filter((p) => onPitch.has(p.id));
  const bench = data.players.filter(
    (p) => !onPitch.has(p.id) && !blocked.has(p.id) && p.status === "available",
  );
  const keepers = court.filter((p) => p.position === "goalkeeper");
  // Con dos porteros en pista (raro) no se sabe a quién: se anota desde la ficha de cada uno.
  const keeper = keepers.length === 1 ? keepers[0] : null;
  const live = safeSummary(log.events, part);
  const title = part !== null ? `Parte ${part} en juego` : `Parte ${state.lastEndedPart} terminada`;
  // Anotar algo anterior al último cambio lo atribuiría al quinteto equivocado.
  const minElapsed = pending !== null && pending.type !== "clock" ? state.clock : undefined;
  const candidates = anchor?.side === "court" ? bench : court.filter((p) => p.id !== anchor?.player.id);

  return (
    <>
      {alerts}
      <LivePanel
        title={title}
        score={live.score}
        teamFouls={live.fouls}
        clockText={formatClock(elapsedToDisplay(now, settings))}
        direction={settings.direction}
        court={court}
        bench={bench}
        keeper={keeper}
        canUndo={target !== null && target.kind !== "red"}
        undoNote={target?.kind === "red" ? "La roja no se puede deshacer desde aquí" : null}
        status={log.status}
        pending={log.pending}
        syncProblem={log.problem}
        onCourtPlayer={setSheetPlayer}
        onBenchPlayer={(player) => setAnchor({ player, side: "bench" })}
        onClock={() => ask({ type: "clock" })}
        onToggleDirection={toggleDirection}
        onRivalGoal={() => ask({ type: "rival_goal" })}
        onSave={() => {
          if (keeper) recordQuick("save", keeper);
        }}
        onEndPart={() => ask({ type: "end" })}
        onUndo={() => setUndoing(true)}
        onRate={() => setRating(true)}
        onRetry={() => void log.flush()}
        onReload={onReload}
      />

      <PlayerActionsDialog
        player={sheetPlayer}
        bench={bench}
        onSubstituteWith={(candidate) => {
          if (sheetPlayer) ask({ type: "sub", out: sheetPlayer.id, in: candidate.id });
          setSheetPlayer(null);
        }}
        onClose={() => setSheetPlayer(null)}
        onQuick={quick}
        onGoal={() => {
          if (sheetPlayer) ask({ type: "goal", playerId: sheetPlayer.id });
          setSheetPlayer(null);
        }}
        onRed={() => {
          if (sheetPlayer) ask({ type: "red", playerId: sheetPlayer.id });
          setSheetPlayer(null);
        }}
        onSubstitute={() => {
          if (sheetPlayer) setAnchor({ player: sheetPlayer, side: "court" });
          setSheetPlayer(null);
        }}
      />
      <SubstitutionDialog
        anchor={anchor}
        candidates={candidates}
        onPick={pickCandidate}
        onClose={() => setAnchor(null)}
      />
      <QuickTimeDialog
        open={pending !== null}
        title={pending ? TITLES[pending.type] : "Tiempo"}
        settings={settings}
        suggested={suggested}
        endOfPart={pending?.type === "end"}
        minElapsed={minElapsed}
        onConfirm={confirmTime}
        onCancel={() => setPending(null)}
      />
      <RatingDialog
        open={rating}
        onPick={(stars) => {
          if (part !== null && !blockedByConflict()) log.recordRating(part, now, stars);
          setRating(false);
        }}
        onClose={() => setRating(false)}
      />
      <UndoDialog
        description={undoing && target ? describeEvent(target, nameOf) : null}
        onConfirm={() => {
          if (!blockedByConflict()) log.undoLast();
          setUndoing(false);
        }}
        onClose={() => setUndoing(false)}
      />
    </>
  );
}

/** Quiénes estaban en pista justo antes del último fin de parte (también los que entraron al final). */
function courtAtEndOfLastPart(lineup: readonly LineupEventRecord[]): string[] {
  const payloads = lineup.map((event) => event.payload);
  const lastEnd = payloads.map((payload) => payload.type).lastIndexOf("part_ended");
  if (lastEnd < 0) return [];
  try {
    return [...onCourt(replay(payloads.slice(0, lastEnd)))];
  } catch {
    return [];
  }
}

function effectiveReds(events: readonly LoggedEvent[]): LoggedEvent[] {
  try {
    return effectiveEvents(events).filter((event) => event.kind === "red") as LoggedEvent[];
  } catch {
    return [];
  }
}

function safeSummary(
  events: readonly LoggedEvent[],
  part: number | null,
): { score: { for: number; against: number }; fouls: number } {
  try {
    const fouls = part === null ? 0 : (teamFoulsByPart(events)[part] ?? 0);
    return { score: score(events), fouls };
  } catch {
    return { score: { for: 0, against: 0 }, fouls: 0 };
  }
}
