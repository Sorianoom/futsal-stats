/**
 * Semanas de puntos: siempre el lunes como `YYYY-MM-DD` en Europe/Madrid. La aritmética se hace
 * en UTC para que el cambio de hora no desplace el día.
 */

const CLUB_TIME_ZONE = "Europe/Madrid";
const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SUNDAY = 0;
const LAST_DAY_OF_WEEK = 6;

const SHORT_DAY = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function parseDay(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  return formatDay(new Date(parseDay(iso).getTime() + days * MS_PER_DAY));
}

export function weekStartOf(iso: string): string {
  const weekday = parseDay(iso).getUTCDay();
  const daysSinceMonday = weekday === SUNDAY ? LAST_DAY_OF_WEEK : weekday - 1;
  return addDays(iso, -daysSinceMonday);
}

/** Día de hoy (`YYYY-MM-DD`) en Madrid, no en UTC. */
export function todayInMadrid(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CLUB_TIME_ZONE }).format(now);
}

/** Lunes de la semana actual según el día en Madrid. */
export function currentWeekStart(now: Date = new Date()): string {
  return weekStartOf(todayInMadrid(now));
}

export function shiftWeek(weekStart: string, weeks: number): string {
  return addDays(weekStart, weeks * DAYS_PER_WEEK);
}

/** "19 oct – 25 oct 2026" */
export function formatWeekRange(weekStart: string): string {
  const sunday = addDays(weekStart, DAYS_PER_WEEK - 1);
  const year = parseDay(sunday).getUTCFullYear();
  return `${SHORT_DAY.format(parseDay(weekStart))} – ${SHORT_DAY.format(parseDay(sunday))} ${year}`;
}
