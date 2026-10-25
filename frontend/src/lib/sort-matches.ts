import type { Match } from "@/lib/api/match-types";

/**
 * Los partidos de más antiguo a más reciente. La fecha es ISO (`AAAA-MM-DD`), así que comparar el
 * texto ordena también a caballo de dos años: septiembre–diciembre de 2026 va antes que enero–junio
 * de 2027. Si coinciden en fecha, desempata por rival para que el orden no dependa del servidor.
 */
export function sortMatchesByDate(matches: readonly Match[]): Match[] {
  return [...matches].sort(
    (a, b) => a.held_on.localeCompare(b.held_on) || a.opponent.localeCompare(b.opponent, "es"),
  );
}
