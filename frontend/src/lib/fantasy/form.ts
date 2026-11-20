/** Cómo va un jugador según sus puntos: colores de las fichas y el «en racha» del mercado. */

export type Tier = "good" | "mid" | "poor";

const GOOD_POINTS = 8;
const POOR_POINTS = 4;
/** Jornadas que cuenta la racha. */
export const HOT_ROUNDS = 3;

/** Buena (8 o más), floja (4 o menos) o normal; sin datos, normal. */
export function tierOf(points: number | null): Tier {
  if (points === null) return "mid";
  if (points >= GOOD_POINTS) return "good";
  if (points <= POOR_POINTS) return "poor";
  return "mid";
}

/** Puntos de las últimas HOT_ROUNDS jornadas. */
export function hotPoints(recent: readonly number[]): number {
  return recent.slice(-HOT_ROUNDS).reduce((sum, points) => sum + points, 0);
}

/** El que más puntos suma en su racha; null si nadie ha sumado nada. En empate, el primero. */
export function hottest<T extends { recent_points?: readonly number[] }>(items: readonly T[]): T | null {
  let best: T | null = null;
  let bestPoints = 0;
  for (const item of items) {
    const points = hotPoints(item.recent_points ?? []);
    if (points > bestPoints) {
      best = item;
      bestPoints = points;
    }
  }
  return best;
}
