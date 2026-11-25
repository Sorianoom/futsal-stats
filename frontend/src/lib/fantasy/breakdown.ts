/** Textos del porqué de los puntos de un jugador en una jornada. */

import type { BreakdownItem } from "@/lib/api/fantasy-types";

/** [singular, plural] de cada acción; `base` no lleva número. */
const ACTIONS: Record<string, readonly [string, string]> = {
  goals: ["gol", "goles"],
  assists: ["asistencia", "asistencias"],
  steals: ["robo", "robos"],
  key_actions: ["acción clave", "acciones clave"],
  turnovers: ["pérdida", "pérdidas"],
  fouls: ["falta", "faltas"],
  yellows: ["amarilla", "amarillas"],
  reds: ["roja", "rojas"],
  clean_streaks: ["racha de 10′ sin gol en contra", "rachas de 10′ sin gol en contra"],
  shots: ["tiro sin gol", "tiros sin gol"],
  goals_for_on_court: ["gol a favor con él en pista", "goles a favor con él en pista"],
  goals_against_on_court: ["gol en contra con él en pista", "goles en contra con él en pista"],
  saves: ["parada", "paradas"],
};


function counted(item: BreakdownItem, words: readonly [string, string] | undefined): string {
  if (!words) return `${item.count} × ${item.key}`;
  return `${item.count} ${item.count === 1 ? words[0] : words[1]}`;
}

export function breakdownLabel(item: BreakdownItem): string {
  return item.key === "base" ? "Base" : counted(item, ACTIONS[item.key]);
}

/** Extras del Fantasy, fuera de la nota (hoy solo el MVP). */
export function bonusLabel(item: BreakdownItem): string {
  return item.key === "mvp" ? "MVP del partido" : counted(item, undefined);
}

const CONTRIBUTION = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

/** Puntuación exacta con sus centésimas: "8,45", "10,7", "5,4". */
export function formatScore(score: number): string {
  return CONTRIBUTION.format(score);
}

/** "+3,0", "+0,15", "−2,0". */
export function formatContribution(points: number): string {
  const text = CONTRIBUTION.format(Math.abs(points));
  return points < 0 ? `−${text}` : `+${text}`;
}

const EPSILON = 1e-9;

/** La puntuación exacta redondeada (,5 hacia arriba), como hace el servidor. */
export function roundedScore(score: number): number {
  return score >= 0 ? Math.floor(score + 0.5 + EPSILON) : -Math.floor(-score + 0.5 - EPSILON);
}
