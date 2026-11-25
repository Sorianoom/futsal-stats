/** Textos del Fantasy: dinero en millones, bloqueo de la alineación y puntos. */

const THOUSANDS_PER_MILLION = 1000;
const CLUB_TIME_ZONE = "Europe/Madrid";

/** Cobro por punto al cerrarse la jornada, en miles: 0,1 M (`PAYOUT_PER_POINT` del backend). */
export const PAYOUT_PER_POINT = 100;

/** Lo que cobra una alineación por sus puntos de la jornada (el capitán ya va contado doble). */
export function payoutFor(points: number): number {
  return Math.max(0, points) * PAYOUT_PER_POINT;
}

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

/** "Se bloquea al empezar el partido (domingo, 15 de noviembre)". `heldOn` es la fecha del
 * partido (AAAA-MM-DD); se lee a mediodía para que ninguna zona horaria la mueva de día. */
export function lockText(heldOn: string): string {
  return `Se bloquea al empezar el partido (${LOCK_DAY.format(new Date(`${heldOn}T12:00:00Z`))})`;
}

export function formatPoints(points: number): string {
  return `${points} ${points === 1 ? "punto" : "puntos"}`;
}

const RATING = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "9,3"; una raya si no hay nota. */
export function formatRating(rating: number | null): string {
  return rating === null ? "—" : RATING.format(rating);
}

const CHANGE = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "always",
});

/** Cambio de valor: 200 → "+0,2 M", -400 → "-0,4 M"; sin cambio, "=". */
export function formatValueChange(thousands: number): string {
  if (thousands === 0) return "=";
  return `${CHANGE.format(thousands / THOUSANDS_PER_MILLION)} M`;
}

const CLOSE_DAY = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", timeZone: CLUB_TIME_ZONE });

/** Un momento (cierre de una venta, fichaje) en hora de Madrid: "dom 15, 00:00". */
export function formatMoment(closesAt: string): string {
  const moment = new Date(closesAt);
  return `${CLOSE_DAY.format(moment)}, ${LOCK_TIME.format(moment)}`;
}
