import type { SeasonPlayerStats } from "@/lib/api/stats-types";

export type LeaderId = "goals" | "assists" | "steals" | "seconds";

export interface Leader {
  id: LeaderId;
  label: string;
  value: number;
  /** Quién lo lidera; más de uno si hay empate. */
  names: string[];
}

const CATEGORIES: readonly { id: LeaderId; label: string }[] = [
  { id: "goals", label: "Goleador" },
  { id: "assists", label: "Asistente" },
  { id: "steals", label: "Más robos" },
  { id: "seconds", label: "Más minutos" },
];

/** El líder de cada categoría de la temporada. Una categoría que nadie ha sumado no aparece. */
export function seasonLeaders(players: readonly SeasonPlayerStats[]): Leader[] {
  return CATEGORIES.flatMap(({ id, label }) => {
    const value = Math.max(0, ...players.map((player) => player[id]));
    if (value === 0) return [];
    const names = players.filter((player) => player[id] === value).map((player) => player.name);
    return [{ id, label, value, names }];
  });
}
