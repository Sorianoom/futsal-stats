import { describe, expect, it } from "vitest";

import type { SeasonPlayerStats } from "@/lib/api/stats-types";

import { seasonLeaders } from "./season-leaders";

function stats(id: string, overrides: Partial<SeasonPlayerStats> = {}): SeasonPlayerStats {
  return {
    player_id: id,
    name: `Jugador ${id}`,
    dorsal: 1,
    seconds: 0,
    goals: 0,
    assists: 0,
    shots: 0,
    turnovers: 0,
    steals: 0,
    key_actions: 0,
    fouls: 0,
    yellows: 0,
    reds: 0,
    saves: 0,
    matches_played: 1,
    ...overrides,
  };
}

describe("seasonLeaders", () => {
  it("devuelve el máximo de goles, asistencias, robos y minutos", () => {
    const leaders = seasonLeaders([
      stats("a", { goals: 5, assists: 1, steals: 2, seconds: 600 }),
      stats("b", { goals: 2, assists: 4, steals: 7, seconds: 1200 }),
    ]);

    expect(leaders).toEqual([
      { id: "goals", label: "Goleador", value: 5, names: ["Jugador a"] },
      { id: "assists", label: "Asistente", value: 4, names: ["Jugador b"] },
      { id: "steals", label: "Más robos", value: 7, names: ["Jugador b"] },
      { id: "seconds", label: "Más minutos", value: 1200, names: ["Jugador b"] },
    ]);
  });

  it("junta a los empatados en el máximo", () => {
    const leaders = seasonLeaders([stats("a", { goals: 3 }), stats("b", { goals: 3 }), stats("c", { goals: 1 })]);

    expect(leaders.find((leader) => leader.id === "goals")?.names).toEqual(["Jugador a", "Jugador b"]);
  });

  it("omite una categoría que nadie ha logrado", () => {
    const leaders = seasonLeaders([stats("a", { seconds: 900 })]);

    expect(leaders.map((leader) => leader.id)).toEqual(["seconds"]);
  });

  it("sin jugadores no hay líderes", () => {
    expect(seasonLeaders([])).toEqual([]);
  });
});
