import type { Role } from "@/lib/api/types";

/** Pantallas que puede abrir un jugador (con sus subrutas): estadísticas y su Fantasy. */
const PLAYER_SECTIONS = ["/estadisticas", "/fantasy"];
const PLAYER_HOME = "/estadisticas";
const STAFF_HOME = "/";

export function isPlayer(role: Role | undefined): boolean {
  return role === "player";
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
