import type { LineupEventRecord, LoggedEvent } from "@/lib/api/match-types";

/**
 * Convocatoria confirmada de un partido en este dispositivo: quién puede salir al campo. Sin
 * confirmar, valen los jugadores disponibles de la plantilla.
 */
const KEY_PREFIX = "match-squad:";

export function loadSquad(matchId: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(`${KEY_PREFIX}${matchId}`);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === "string") ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSquad(matchId: string, playerIds: readonly string[]): void {
  try {
    window.localStorage.setItem(`${KEY_PREFIX}${matchId}`, JSON.stringify(playerIds));
  } catch {
    // Sin almacenamiento: la convocatoria vale hasta recargar.
  }
}

/** Jugadores que ya tienen algo anotado en el partido (alineación o eventos). */
export function playersInMatch(lineup: readonly LineupEventRecord[], events: readonly LoggedEvent[]): Set<string> {
  const ids = new Set<string>();
  for (const { payload } of lineup) {
    if ("starters" in payload) payload.starters.forEach((id) => ids.add(id));
    if ("player_out" in payload) ids.add(payload.player_out);
    if ("player_in" in payload) ids.add(payload.player_in);
    if ("player_id" in payload) ids.add(payload.player_id);
  }
  for (const event of events) if (event.player_id) ids.add(event.player_id);
  return ids;
}
