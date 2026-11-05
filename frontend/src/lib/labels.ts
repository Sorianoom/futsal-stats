import type {
  AttendanceStatus,
  PlayerStatus,
  Position,
  Role,
  Sanction,
  SanctionKind,
  SessionKind,
  Severity,
  WinKind,
} from "@/lib/api/types";
import type { EventKind, MatchEvent } from "@/lib/match/events";

export const ROLE_LABEL: Record<Role, string> = {
  head_coach: "Entrenador",
  assistant_coach: "Segundo entrenador",
};

export const POSITION_LABEL: Record<Position, string> = {
  field: "Campo",
  goalkeeper: "Portero",
};

export const STATUS_LABEL: Record<PlayerStatus, string> = {
  available: "Disponible",
  injured: "Lesionado",
};

export const SESSION_KIND_LABEL: Record<SessionKind, string> = {
  training: "Entreno",
  match: "Partido",
  physio: "Fisio",
  other: "Otro",
};

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  attended: "Asistió",
  justified: "Falta justificada",
  unjustified: "Falta injustificada",
  late: "Llegó tarde",
};

export const WIN_KIND_LABEL: Record<WinKind, string> = {
  exercise: "Ejercicio ganado",
  scrimmage: "Partidillo final ganado",
  goalkeeper: "Portero",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  light: "Leve",
  serious: "Grave",
  very_serious: "Muy grave",
};

export const SANCTION_LABEL: Record<SanctionKind, string> = {
  no_play: "No juega",
  no_callup: "Sin convocatoria",
};

/** "No juega (1–2 partidos)" */
export function sanctionText(sanction: Sanction): string {
  const { min_matches: min, max_matches: max } = sanction;
  const matches = min === max ? `${min} ${min === 1 ? "partido" : "partidos"}` : `${min}–${max} partidos`;
  return `${SANCTION_LABEL[sanction.kind]} (${matches})`;
}

export const EVENT_LABEL: Record<EventKind, string> = {
  goal: "Gol",
  assist: "Asistencia",
  shot: "Tiro",
  turnover: "Pérdida",
  steal: "Robo",
  foul: "Falta",
  yellow: "Amarilla",
  red: "Roja",
  rival_goal: "Gol rival",
  save: "Parada",
  undo: "Deshacer",
};

/** "Gol de Ana Ruiz", "Gol rival" */
export function describeEvent(event: MatchEvent, nameOf: (playerId: string) => string): string {
  const label = EVENT_LABEL[event.kind];
  return event.player_id ? `${label} de ${nameOf(event.player_id)}` : label;
}
