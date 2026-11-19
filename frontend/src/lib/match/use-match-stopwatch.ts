"use client";

import { useEffect, useState } from "react";

import { loadClockSettings, saveClockSettings } from "./clock";
import {
  elapsedSeconds,
  loadMatchClock,
  saveMatchClock,
  setElapsed,
  settle,
  shiftDisplay,
  stoppedAt,
  toggle as toggleWatch,
  type MatchClock,
  type Stopwatch,
} from "./stopwatch";

/** Solo para repintar: lo jugado se calcula siempre por diferencia de horas. */
const REPAINT_MS = 250;

interface Options {
  matchId: string;
  /** Parte en juego; `null` en el descanso o antes de empezar. */
  part: number | null;
  /** Desde dónde empieza el reloj si no hay nada guardado (p. ej. el último tiempo anotado). */
  seed: number;
}

export interface MatchStopwatch {
  /** Segundos jugados que se ven ahora (se repinta con el tick). */
  elapsed: number;
  partSeconds: number;
  running: boolean;
  /** Segundos jugados en este instante, por la hora real. Para anotar acciones. */
  read: () => number;
  toggle: () => void;
  /** Mueve lo que se ve: positivo = el marcador sube. */
  shift: (deltaSeconds: number) => void;
  set: (elapsed: number) => void;
  setPartSeconds: (partSeconds: number) => void;
  pause: () => void;
}

/** Reloj de la parte en juego, guardado por partido y parte en el dispositivo. */
export function useMatchStopwatch({ matchId, part, seed }: Options): MatchStopwatch {
  const [stored, setStored] = useState<MatchClock | null>(() => loadMatchClock(matchId));
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Al cambiar de parte el reloj vuelve a la duración de la parte, parado.
  const partSeconds = stored?.partSeconds ?? loadClockSettings().partSeconds;
  const current: MatchClock =
    stored !== null && stored.part === part
      ? stored
      : { part: part ?? 0, partSeconds, watch: stoppedAt(Math.min(seed, partSeconds)) };
  const { watch } = current;

  function update(next: (watch: Stopwatch, at: number) => Stopwatch, nextPartSeconds = current.partSeconds) {
    if (part === null) return;
    const at = Date.now();
    const clock: MatchClock = { part, partSeconds: nextPartSeconds, watch: next(watch, at) };
    setStored(clock);
    setNowMs(at);
    saveMatchClock(matchId, clock);
  }

  useEffect(() => {
    if (!watch.running || part === null) return;
    const timer = window.setInterval(() => {
      const at = Date.now();
      setNowMs(at);
      const settled = settle(watch, at, current.partSeconds);
      if (settled !== watch) {
        const clock: MatchClock = { part, partSeconds: current.partSeconds, watch: settled };
        setStored(clock);
        saveMatchClock(matchId, clock);
      }
    }, REPAINT_MS);
    return () => window.clearInterval(timer);
  }, [watch, part, matchId, current.partSeconds]);

  return {
    elapsed: elapsedSeconds(watch, nowMs, current.partSeconds),
    partSeconds: current.partSeconds,
    running: watch.running,
    read: () => elapsedSeconds(watch, Date.now(), current.partSeconds),
    toggle: () => update((w, at) => toggleWatch(w, at, current.partSeconds)),
    shift: (delta) => update((w, at) => shiftDisplay(w, delta, at, current.partSeconds)),
    set: (elapsed) => update((w, at) => setElapsed(w, elapsed, at, current.partSeconds)),
    pause: () => update((w, at) => (w.running ? toggleWatch(w, at, current.partSeconds) : w)),
    setPartSeconds: (next) => {
      saveClockSettings({ ...loadClockSettings(), partSeconds: next });
      update((w, at) => setElapsed(w, elapsedSeconds(w, at, current.partSeconds), at, next), next);
    },
  };
}
