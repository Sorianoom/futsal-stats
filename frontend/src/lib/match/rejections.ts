/** Texto del aviso de lo que el servidor rechazó: qué era y por qué. */

import { describeEvent } from "@/lib/labels";

import type { Rejection } from "./use-match-log";

const REASONS: Record<string, string> = {
  unknown_player: "jugador desconocido",
  void_target_missing: "no se encontró lo que deshacía",
  void_of_undo: "no se puede deshacer un deshacer",
  already_voided: "ya estaba deshecho",
  void_not_last: "no era el último movimiento",
};

function what(rejection: Rejection, nameOf: (id: string) => string, timeText: (t: number) => string): string {
  const { event, lineup, rating } = rejection;
  if (event) return `${describeEvent(event, nameOf)} (${timeText(event.t)})`;
  if (rating) return `Valoración de ${rating.stars} estrellas (${timeText(rating.t)})`;
  if (!lineup) return "Algo anotado";
  const { payload } = lineup;
  switch (payload.type) {
    case "substituted":
      return `Cambio: entra ${nameOf(payload.player_in)}, sale ${nameOf(payload.player_out)} (${timeText(payload.t)})`;
    case "sent_off":
      return `Expulsión de ${nameOf(payload.player_id)} (${timeText(payload.t)})`;
    case "part_ended":
      return `Fin de parte (${timeText(payload.t)})`;
    case "part_started":
      return `Inicio de la ${payload.part}ª parte`;
    case "undo":
      return "Deshacer un movimiento de alineación";
  }
}

export function describeRejection(
  rejection: Rejection,
  nameOf: (id: string) => string,
  timeText: (t: number) => string,
): string {
  return `${what(rejection, nameOf, timeText)}: ${REASONS[rejection.reason] ?? rejection.reason}`;
}

const STORAGE_PREFIX = "futsal:rejections:";

function isRejection(value: unknown): value is Rejection {
  if (typeof value !== "object" || value === null) return false;
  const { id, reason } = value as Record<string, unknown>;
  return typeof id === "string" && typeof reason === "string";
}

/**
 * Lo rechazado que aún no se ha atendido en este partido. Se guarda en el dispositivo para que el
 * aviso no se pierda con una recarga: lo rechazado ya no está en el registro y no se recupera.
 */
export function loadRejections(matchId: string): Rejection[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_PREFIX + matchId) ?? "[]");
    return Array.isArray(stored) && stored.every(isRejection) ? stored : [];
  } catch {
    return [];
  }
}

/** Una lista vacía (aviso atendido) borra lo guardado. */
export function saveRejections(matchId: string, rejections: readonly Rejection[]): void {
  try {
    if (rejections.length === 0) window.localStorage.removeItem(STORAGE_PREFIX + matchId);
    else window.localStorage.setItem(STORAGE_PREFIX + matchId, JSON.stringify(rejections));
  } catch {
    // Sin almacenamiento (modo privado): el aviso solo dura mientras la pestaña esté abierta.
  }
}
