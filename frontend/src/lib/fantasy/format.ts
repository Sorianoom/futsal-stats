/** Textos del Fantasy: dinero en millones, bloqueo de la alineación y puntos. */

const THOUSANDS_PER_MILLION = 1000;
const CLUB_TIME_ZONE = "Europe/Madrid";

const MILLIONS = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** La API da el dinero en miles: 20000 → "20,0 M". */
export function formatMoney(thousands: number): string {
  return `${MILLIONS.format(thousands / THOUSANDS_PER_MILLION)} M`;
}

const LOCK_DAY = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: CLUB_TIME_ZONE,
});
const LOCK_TIME = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: CLUB_TIME_ZONE,
});

/** "Se bloquea el domingo, 15 de noviembre a las 00:00", en hora de Madrid. */
export function lockText(locksAt: string): string {
  const moment = new Date(locksAt);
  return `Se bloquea el ${LOCK_DAY.format(moment)} a las ${LOCK_TIME.format(moment)}`;
}

export function formatPoints(points: number): string {
  return `${points} ${points === 1 ? "punto" : "puntos"}`;
}

const RATING = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "9,3"; una raya si no hay nota. */
export function formatRating(rating: number | null): string {
  return rating === null ? "—" : RATING.format(rating);
}
