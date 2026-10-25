/**
 * La app no lleva el reloj: lo lleva el árbitro de mesa. Quien usa la app lee el marcador y
 * escribe lo que ve; aquí se convierte ese valor en segundos jugados de la parte, que es lo que
 * entiende el dominio (`lineup.ts`). Si el marcador baja desde 20:00, lo jugado es lo que falta
 * para llegar a la duración de la parte.
 */

export type ClockDirection = "down" | "up";

export interface ClockSettings {
  direction: ClockDirection;
  partSeconds: number;
}

export const DEFAULT_CLOCK: ClockSettings = { direction: "down", partSeconds: 1200 };

const STORAGE_KEY = "futsal:clock";
const SECONDS_PER_MINUTE = 60;
const MAX_PART_SECONDS = 7200;
const DIGITS_PER_MINUTE = 100;
const MAX_SECONDS_FIELD = 59;

export type ParsedScoreboard = { ok: true; elapsed: number } | { ok: false; error: string };

export function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const rest = seconds % SECONDS_PER_MINUTE;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/** Los dos últimos dígitos son segundos y el resto minutos: "1230" es 12:30. */
export function digitsToSeconds(digits: string): number {
  const value = Number(digits || 0);
  const minutes = Math.floor(value / DIGITS_PER_MINUTE);
  return minutes * SECONDS_PER_MINUTE + (value % DIGITS_PER_MINUTE);
}

export function secondsToDigits(seconds: number): string {
  if (seconds <= 0) return "";
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  return String(minutes * DIGITS_PER_MINUTE + (seconds % SECONDS_PER_MINUTE));
}

/** Lo que marca el marcador cuando han transcurrido `elapsed` segundos de la parte. */
export function elapsedToDisplay(elapsed: number, settings: ClockSettings): number {
  return settings.direction === "down" ? settings.partSeconds - elapsed : elapsed;
}

/** Convierte lo tecleado (lo que se lee en el marcador) en segundos jugados de la parte. */
export function parseScoreboard(digits: string, settings: ClockSettings): ParsedScoreboard {
  const secondsField = Number(digits.slice(-2) || 0);
  if (secondsField > MAX_SECONDS_FIELD) {
    return { ok: false, error: "Los segundos van de 00 a 59" };
  }
  const shown = digitsToSeconds(digits);
  const elapsed = settings.direction === "down" ? settings.partSeconds - shown : shown;
  if (elapsed < 0 || elapsed > settings.partSeconds) {
    return {
      ok: false,
      error: `Ese tiempo no cabe en una parte de ${formatClock(settings.partSeconds)}`,
    };
  }
  return { ok: true, elapsed };
}

const MS_PER_SECOND = 1000;
const ESTIMATE_STEP_SECONDS = 10;

export interface ElapsedSuggestion {
  /** Último tiempo de la parte confirmado, en segundos jugados. */
  lastElapsed: number;
  /** Cuándo se confirmó (`Date.now()`); `null` si no se sabe (p. ej. tras recargar). */
  lastAt: number | null;
  nowMs: number;
  maxElapsed: number;
}

/**
 * Tiempo que probablemente marca el marcador ahora: el último confirmado más lo que ha pasado en
 * la vida real, de 10 en 10 segundos. Es una estimación (el marcador se para en cada pausa), así
 * que solo es el punto de partida que luego se ajusta con un par de toques.
 */
export function suggestElapsed({ lastElapsed, lastAt, nowMs, maxElapsed }: ElapsedSuggestion): number {
  if (lastAt === null) return lastElapsed;
  const realSeconds = Math.max(0, (nowMs - lastAt) / MS_PER_SECOND);
  const steps = Math.floor(realSeconds / ESTIMATE_STEP_SECONDS) * ESTIMATE_STEP_SECONDS;
  return Math.min(lastElapsed + steps, maxElapsed);
}

/**
 * Mueve lo que se VE en el marcador `deltaSeconds` (positivo = el número sube) y devuelve los
 * segundos jugados resultantes, sin salir de la parte ni bajar de `minElapsed`.
 */
export function shiftDisplay(
  elapsed: number,
  deltaSeconds: number,
  settings: ClockSettings,
  minElapsed = 0,
): number {
  const moved = settings.direction === "down" ? elapsed - deltaSeconds : elapsed + deltaSeconds;
  return Math.min(Math.max(moved, minElapsed), settings.partSeconds);
}

function isValid(value: unknown): value is ClockSettings {
  if (typeof value !== "object" || value === null) return false;
  const { direction, partSeconds } = value as Record<string, unknown>;
  return (
    (direction === "down" || direction === "up") &&
    typeof partSeconds === "number" &&
    Number.isInteger(partSeconds) &&
    partSeconds > 0 &&
    partSeconds <= MAX_PART_SECONDS
  );
}

export function loadClockSettings(): ClockSettings {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    return isValid(stored) ? stored : DEFAULT_CLOCK;
  } catch {
    return DEFAULT_CLOCK;
  }
}

export function saveClockSettings(settings: ClockSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Sin almacenamiento (modo privado): el ajuste solo dura mientras la pestaña esté abierta.
  }
}
