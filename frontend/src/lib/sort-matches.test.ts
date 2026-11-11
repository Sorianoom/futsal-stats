import { describe, expect, it } from "vitest";

import type { Match } from "@/lib/api/match-types";

import { sortMatchesByDate } from "./sort-matches";

function match(id: string, held_on: string, opponent = `Rival ${id}`): Match {
  return { id, session_id: `s-${id}`, held_on, opponent, is_official: true };
}

describe("sortMatchesByDate", () => {
  it("ordena del más antiguo al más reciente", () => {
    const sorted = sortMatchesByDate([match("c", "2026-12-13"), match("a", "2026-10-18"), match("b", "2026-11-08")]);

    expect(sorted.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("pone los de enero a junio de 2027 detrás de los de septiembre a diciembre de 2026", () => {
    const sorted = sortMatchesByDate([
      match("feb", "2027-02-28"),
      match("jun", "2027-06-13"),
      match("sep", "2026-09-20"),
      match("jan", "2027-01-24"),
      match("dec", "2026-12-20"),
    ]);

    expect(sorted.map((m) => m.id)).toEqual(["sep", "dec", "jan", "feb", "jun"]);
  });

  it("si coinciden en fecha, desempata por rival para que el orden sea estable", () => {
    const sorted = sortMatchesByDate([match("b", "2026-11-08", "Zeta"), match("a", "2026-11-08", "Alfa")]);

    expect(sorted.map((m) => m.opponent)).toEqual(["Alfa", "Zeta"]);
  });

  it("no modifica la lista original", () => {
    const original = [match("b", "2026-11-08"), match("a", "2026-10-18")];

    sortMatchesByDate(original);

    expect(original.map((m) => m.id)).toEqual(["b", "a"]);
  });

  it("con una lista vacía devuelve otra vacía", () => {
    expect(sortMatchesByDate([])).toEqual([]);
  });
});
