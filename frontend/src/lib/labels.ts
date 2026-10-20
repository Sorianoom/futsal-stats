import type {
  AttendanceStatus,
  PlayerStatus,
  Position,
  Role,
  SanctionKind,
  SessionKind,
  Severity,
  WinKind,
} from "@/lib/api/types";

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
