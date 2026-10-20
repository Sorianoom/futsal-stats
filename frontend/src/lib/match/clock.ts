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
