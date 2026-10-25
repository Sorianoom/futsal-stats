import type { Player } from "@/lib/api/types";

/** Posición de un jugador sobre la cancha, en % del ancho (x) y del alto (y). */
export interface CourtSlot {
  x: number;
  y: number;
}

export interface PlacedPlayer extends CourtSlot {
  player: Player;
}

/**
 * Un 1-2-1 con la portería a la izquierda: portero, cierre, dos alas y pívot.
 * La primera posición es la del portero.
 */
export const COURT_SLOTS: readonly CourtSlot[] = [
  { x: 9, y: 50 },
  { x: 31, y: 50 },
  { x: 58, y: 24 },
  { x: 58, y: 76 },
  { x: 84, y: 50 },
];

const KEEPER_SLOT = 0;
const FIELD_SLOT_ORDER = [1, 2, 3, 4];

/**
 * Reparte a los jugadores en pista por la cancha, conservando el orden recibido.
 * El portero va a su sitio; los demás ocupan el resto por orden y, si no hay portero,
 * el quinto de campo ocupa el sitio del portero. Nunca deja a nadie fuera: si hubiera
 * más jugadores que posiciones, repite posiciones antes que ocultar a uno.
 */
export function courtSlots(players: readonly Player[]): PlacedPlayer[] {
  const keeper = players.find((player) => player.position === "goalkeeper");
  const order = keeper ? FIELD_SLOT_ORDER : [...FIELD_SLOT_ORDER, KEEPER_SLOT];
  let nextField = 0;

  return players.map((player) => {
    const index = player === keeper ? KEEPER_SLOT : order[nextField++ % order.length];
    const { x, y } = COURT_SLOTS[index];
    return { player, x, y };
  });
}
