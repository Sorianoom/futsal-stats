import { describe, expect, it } from "vitest";

import { clauseBlock, clauseRaiseCost } from "./clauses";

const NOW = new Date("2026-11-20T10:00:00Z");

describe("clauseRaiseCost", () => {
  it("es la mitad de la subida, redondeando hacia arriba a miles", () => {
    expect(clauseRaiseCost(6000, 8000)).toBe(1000);
    expect(clauseRaiseCost(6000, 6001)).toBe(1);
  });

  it("sin subida no cuesta nada", () => {
    expect(clauseRaiseCost(6000, 6000)).toBe(0);
    expect(clauseRaiseCost(6000, 5000)).toBe(0);
  });
});

describe("clauseBlock", () => {
  const free = { mine: false, player_id: "p9", protected_until: "2026-11-19T10:00:00Z" };
  const context = { matchDay: false, now: NOW, ownedPlayers: new Set(["p1"]), squadFull: false };

  it("se puede clausular una copia ajena sin protección fuera del día de partido", () => {
    expect(clauseBlock(free, context)).toBeNull();
  });

  it("las mías no se clausulan", () => {
    expect(clauseBlock({ ...free, mine: true }, context)).toBe("mine");
  });

  it("el día de partido no se puede", () => {
    expect(clauseBlock(free, { ...context, matchDay: true })).toBe("match_day");
  });

  it("mientras dura la protección no se puede", () => {
    expect(clauseBlock({ ...free, protected_until: "2026-11-20T10:01:00Z" }, context)).toBe("protected");
  });

  it("justo al acabar la protección ya se puede", () => {
    expect(clauseBlock({ ...free, protected_until: "2026-11-20T10:00:00Z" }, context)).toBeNull();
  });

  it("con la plantilla llena no se puede", () => {
    expect(clauseBlock(free, { ...context, squadFull: true })).toBe("squad_full");
  });

  it("no se puede fichar otra copia de un jugador que ya tengo", () => {
    expect(clauseBlock({ ...free, player_id: "p1" }, context)).toBe("already_have");
  });
});
