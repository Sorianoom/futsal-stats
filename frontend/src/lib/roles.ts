import type { Role } from "@/lib/api/types";

/**
 * Pantallas que puede abrir un jugador o una cuenta del Fantasy del cuerpo técnico (con sus
 * subrutas): su Fantasy y las estadísticas de todos.
 */
const PLAYER_SECTIONS = ["/fantasy", "/estadisticas"];
const PLAYER_HOME = "/fantasy";
const STAFF_HOME = "/";

/** Cuentas que solo juegan al Fantasy y ven estadísticas: jugadores y cuentas del Fantasy. */
export function isPlayer(role: Role | undefined): boolean {
  return role === "player" || role === "fantasy";
}

/** Adónde va cada rol al entrar en la app o al pedir una pantalla que no le corresponde. */
export function homeFor(role: Role): string {
  return isPlayer(role) ? PLAYER_HOME : STAFF_HOME;
}

/** Los entrenadores ven toda la app; el jugador, solo sus secciones. */
export function canVisit(role: Role, pathname: string): boolean {
  if (!isPlayer(role)) return true;
  return PLAYER_SECTIONS.some((section) => pathname === section || pathname.startsWith(`${section}/`));
}
