/**
 * Cronómetro de la parte. Cuenta atrás desde la duración de la parte, como el marcador del
 * pabellón, y se arranca y se para a mano cuando el árbitro para el juego.
 *
 * Lo jugado se calcula SIEMPRE por diferencia de horas (`Date.now()`), nunca contando ticks: así no
 * se descuadra con el iPad bloqueado, la app en segundo plano o una recarga. El tick de la pantalla
 * solo sirve para repintar.
 *
 * Todo es puro y en segundos jugados (lo que entiende el dominio); lo que se ve es la duración menos
 * lo jugado.
 */

export interface Stopwatch {
  running: boolean;
  /** Segundos jugados (con fracciones) al arrancar por última vez; si está parado, los totales. */
  elapsedAtStart: number;
  /** Hora real (`Date.now()`) del último arranque; `null` si está parado. */
  startedAtMs: number | null;
}

/** Cronómetro de un partido: en qué parte va, cuánto dura cada parte y el reloj. */
export interface MatchClock {
  part: number;
  partSeconds: number;
  watch: Stopwatch;
}

const MS_PER_SECOND = 1000;
// Evita que 299.9999999 (suma de fracciones) se vea como 299 en vez de 300.
const EPSILON = 1e-6;
const STORAGE_PREFIX = "futsal:stopwatch:";
const MAX_PART_SECONDS = 7200;

function clamp(elapsed: number, partSeconds: number): number {
  return Math.min(Math.max(elapsed, 0), partSeconds);
}

export function stoppedAt(elapsed: number): Stopwatch {
  return { running: false, elapsedAtStart: elapsed, startedAtMs: null };
}

/** Segundos jugados exactos (con fracciones), sin salir de la parte. */
function exactElapsed(watch: Stopwatch, nowMs: number, partSeconds: number): number {
  const sinceStart =
    watch.running && watch.startedAtMs !== null ? Math.max(0, nowMs - watch.startedAtMs) / MS_PER_SECOND : 0;
  return clamp(watch.elapsedAtStart + sinceStart, partSeconds);
}

/** Segundos jugados enteros: lo que se anota en cada acción. */
export function elapsedSeconds(watch: Stopwatch, nowMs: number, partSeconds: number): number {
  return Math.floor(exactElapsed(watch, nowMs, partSeconds) + EPSILON);
}

/** Vuelve a contar desde `elapsed` ahora mismo, en marcha o parado según estaba. */
function rebase(watch: Stopwatch, elapsed: number, nowMs: number, partSeconds: number): Stopwatch {
  const bounded = clamp(elapsed, partSeconds);
  if (!watch.running || bounded >= partSeconds) return stoppedAt(bounded);
  return { running: true, elapsedAtStart: bounded, startedAtMs: nowMs };
}

export function start(watch: Stopwatch, nowMs: number, partSeconds: number): Stopwatch {
  if (watch.running) return watch;
  const elapsed = exactElapsed(watch, nowMs, partSeconds);
  if (elapsed >= partSeconds) return stoppedAt(partSeconds);
  return { running: true, elapsedAtStart: elapsed, startedAtMs: nowMs };
}

export function pause(watch: Stopwatch, nowMs: number, partSeconds: number): Stopwatch {
  if (!watch.running) return watch;
  return stoppedAt(exactElapsed(watch, nowMs, partSeconds));
}

export function toggle(watch: Stopwatch, nowMs: number, partSeconds: number): Stopwatch {
  return watch.running ? pause(watch, nowMs, partSeconds) : start(watch, nowMs, partSeconds);
}

/** Para el reloj si ya llegó a 0:00; si no, lo devuelve tal cual (misma referencia). */
export function settle(watch: Stopwatch, nowMs: number, partSeconds: number): Stopwatch {
  if (!watch.running || exactElapsed(watch, nowMs, partSeconds) < partSeconds) return watch;
  return stoppedAt(partSeconds);
}

/**
 * Mueve lo que se VE `deltaSeconds` (positivo = el marcador sube, es decir, menos tiempo jugado).
 * Vale hacia delante y hacia atrás: el reloj es de la mesa, no del registro.
 */
export function shiftDisplay(watch: Stopwatch, deltaSeconds: number, nowMs: number, partSeconds: number): Stopwatch {
  return rebase(watch, exactElapsed(watch, nowMs, partSeconds) - deltaSeconds, nowMs, partSeconds);
}

/** Pone el tiempo jugado exacto (lo tecleado al cuadrarlo con la mesa). */
export function setElapsed(watch: Stopwatch, elapsed: number, nowMs: number, partSeconds: number): Stopwatch {
  return rebase(watch, elapsed, nowMs, partSeconds);
}

/**
 * Tiempo con el que se anota una acción. El dominio (`lineup.ts` y el backend) exige que el reloj
 * de la alineación no retroceda; pero el cronómetro sí puede ir por detrás del último movimiento si
 * se ajustó hacia atrás. DECISIÓN: no se bloquea nunca al entrenador por el tiempo. Se anota en
 * `max(reloj, último movimiento)` y `behind` indica que hay que avisar (discretamente, no como error).
 */
export function actionTime(clockElapsed: number, lastMovement: number): { t: number; behind: boolean } {
  if (clockElapsed >= lastMovement) return { t: clockElapsed, behind: false };
  return { t: lastMovement, behind: true };
}

function isStopwatch(value: unknown): value is Stopwatch {
  if (typeof value !== "object" || value === null) return false;
  const { running, elapsedAtStart, startedAtMs } = value as Record<string, unknown>;
  if (typeof elapsedAtStart !== "number" || !Number.isFinite(elapsedAtStart) || elapsedAtStart < 0) return false;
  if (running === false) return startedAtMs === null;
  return running === true && typeof startedAtMs === "number" && Number.isFinite(startedAtMs);
}

function isMatchClock(value: unknown): value is MatchClock {
  if (typeof value !== "object" || value === null) return false;
  const { part, partSeconds, watch } = value as Record<string, unknown>;
  return (
    typeof part === "number" &&
    Number.isInteger(part) &&
    part > 0 &&
    typeof partSeconds === "number" &&
    Number.isInteger(partSeconds) &&
    partSeconds > 0 &&
    partSeconds <= MAX_PART_SECONDS &&
    isStopwatch(watch)
  );
}

/** Lo guardado en este dispositivo para el partido, o `null` si no hay nada válido. */
export function loadMatchClock(matchId: string): MatchClock | null {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_PREFIX + matchId) ?? "null");
    return isMatchClock(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Olvida el reloj guardado del partido (al borrar sus estadísticas para empezarlo de nuevo). */
export function forgetMatchClock(matchId: string): void {
  try {
    window.localStorage.removeItem(STORAGE_PREFIX + matchId);
  } catch {
    // Sin almacenamiento no hay nada que olvidar.
  }
}

export function saveMatchClock(matchId: string, clock: MatchClock): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + matchId, JSON.stringify(clock));
  } catch {
    // Sin almacenamiento (modo privado): el reloj solo dura mientras la pestaña esté abierta.
  }
}
