/** Cuentas del mercado: importes tecleados en millones, venta a la banca y cuenta atrás. */

const THOUSANDS_PER_MILLION = 1000;
/** Tope de la API para precios y pujas: 1000 M. */
const MAX_THOUSANDS = 1_000_000;
/** Millones con hasta 3 decimales (la API trabaja en miles enteros); coma o punto decimal. */
const MILLIONS_PATTERN = /^(\d*)(?:[.,](\d{0,3}))?$/;

export type ParsedMillions = { ok: true; thousands: number | null } | { ok: false };

/** "4,5" → 4500 miles. Vacío → null (sin importe). Negativos, letras o más de 1000 M, no. */
export function parseMillions(text: string): ParsedMillions {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, thousands: null };
  const match = MILLIONS_PATTERN.exec(trimmed);
  if (!match || (match[1] === "" && !match[2])) return { ok: false };
  const whole = Number(match[1] || "0");
  const decimals = Number((match[2] ?? "").padEnd(3, "0"));
  const thousands = whole * THOUSANDS_PER_MILLION + decimals;
  return thousands > MAX_THOUSANDS ? { ok: false } : { ok: true, thousands };
}

const EDITABLE = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 3, useGrouping: false });

/** Importe para un campo editable, sin "M" ni separador de miles: 5500 → "5,5". */
export function millionsInput(thousands: number): string {
  return EDITABLE.format(thousands / THOUSANDS_PER_MILLION);
}

const BANK_SALE_PERCENT = 70;

/** Lo que paga la banca: el 70 % del valor, hacia abajo a miles enteros (sin decimales flotantes). */
export function bankSalePrice(value: number): number {
  return Math.floor((value * BANK_SALE_PERCENT) / 100);
}

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

/** Lo que falta para que cierre una venta: "3 h 25 min", "12 min", "menos de 1 min" o "cerrando". */
export function closingIn(closesAt: string, now: Date): string {
  const remaining = new Date(closesAt).getTime() - now.getTime();
  if (remaining <= 0) return "cerrando";
  const minutes = Math.floor(remaining / MS_PER_MINUTE);
  if (minutes === 0) return "menos de 1 min";
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  return hours === 0 ? `${rest} min` : `${hours} h ${rest} min`;
}
