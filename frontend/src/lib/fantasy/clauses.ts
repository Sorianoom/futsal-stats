/** Cuentas de las cláusulas: coste de subirla y si una copia se puede clausular ahora. */

const RAISE_COST_DIVISOR = 2;

/** Lo que cuesta subir la cláusula: la mitad de la subida, hacia arriba a miles enteros. */
export function clauseRaiseCost(current: number, next: number): number {
  return next <= current ? 0 : Math.ceil((next - current) / RAISE_COST_DIVISOR);
}

/** Por qué no se puede clausular una copia ahora; null si se puede. Mismo orden que el servidor. */
export type ClauseBlock = "mine" | "match_day" | "protected" | "squad_full" | "already_have";

export interface ClauseContext {
  matchDay: boolean;
  now: Date;
  /** Jugadores de los que ya tengo copia. */
  ownedPlayers: ReadonlySet<string>;
  squadFull: boolean;
}

export function clauseBlock(
  copy: { mine: boolean; player_id: string; protected_until: string },
  { matchDay, now, ownedPlayers, squadFull }: ClauseContext,
): ClauseBlock | null {
  if (copy.mine) return "mine";
  if (matchDay) return "match_day";
  if (now.getTime() < new Date(copy.protected_until).getTime()) return "protected";
  if (squadFull) return "squad_full";
  if (ownedPlayers.has(copy.player_id)) return "already_have";
  return null;
}
