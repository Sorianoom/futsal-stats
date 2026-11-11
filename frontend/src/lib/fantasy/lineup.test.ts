import { describe, expect, it } from "vitest";

import type { FantasyLineup, SquadCopy } from "@/lib/api/fantasy-types";

import { assignSlot, isLinedUp, sameLineup, slotOptions } from "./lineup";

const copy = (id: string, position: SquadCopy["position"]): SquadCopy => ({
  copy_id: id,
  player_id: `p-${id}`,
  name: `Jugador ${id}`,
  dorsal: 1,
  position,
  value: 4000,
});

const SQUAD: SquadCopy[] = [copy("c1", "field"), copy("c2", "field"), copy("c3", "field"), copy("g1", "goalkeeper")];

const LINEUP: FantasyLineup = { goalkeeper_copy_id: null, field_copy_ids: ["c1", "c2", null, null] };

describe("slotOptions", () => {
  it("el hueco de portero solo ofrece porteros", () => {
    expect(slotOptions(SQUAD, LINEUP, { kind: "goalkeeper" }).map((c) => c.copy_id)).toEqual(["g1"]);
  });

  it("un hueco de campo ofrece jugadores de campo que no están en otro hueco, más el suyo", () => {
    expect(slotOptions(SQUAD, LINEUP, { kind: "field", index: 2 }).map((c) => c.copy_id)).toEqual(["c3"]);
    expect(slotOptions(SQUAD, LINEUP, { kind: "field", index: 0 }).map((c) => c.copy_id)).toEqual(["c1", "c3"]);
  });
});

describe("assignSlot", () => {
  it("devuelve una alineación nueva sin tocar la original", () => {
    const next = assignSlot(LINEUP, { kind: "field", index: 2 }, "c3");

    expect(next.field_copy_ids).toEqual(["c1", "c2", "c3", null]);
    expect(LINEUP.field_copy_ids).toEqual(["c1", "c2", null, null]);
  });

  it("pone o quita al portero", () => {
    const withKeeper = assignSlot(LINEUP, { kind: "goalkeeper" }, "g1");
    expect(withKeeper.goalkeeper_copy_id).toBe("g1");
    expect(assignSlot(withKeeper, { kind: "goalkeeper" }, null).goalkeeper_copy_id).toBeNull();
  });
});

describe("sameLineup e isLinedUp", () => {
  it("compara por contenido", () => {
    expect(sameLineup(LINEUP, { goalkeeper_copy_id: null, field_copy_ids: ["c1", "c2", null, null] })).toBe(true);
    expect(sameLineup(LINEUP, assignSlot(LINEUP, { kind: "field", index: 3 }, "c3"))).toBe(false);
  });

  it("sabe si una copia está alineada", () => {
    expect(isLinedUp(LINEUP, "c1")).toBe(true);
    expect(isLinedUp(LINEUP, "c3")).toBe(false);
    expect(isLinedUp(assignSlot(LINEUP, { kind: "goalkeeper" }, "g1"), "g1")).toBe(true);
  });
});
