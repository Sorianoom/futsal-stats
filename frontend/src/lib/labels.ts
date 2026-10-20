import type { PlayerStatus, Position, Role } from "@/lib/api/types";

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
