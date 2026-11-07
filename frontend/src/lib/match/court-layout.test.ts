import { describe, expect, it } from "vitest";

import type { Player, Position } from "@/lib/api/types";

import { COURT_SLOTS, courtSlots } from "./court-layout";

function player(id: string, position: Position = "field"): Player {
  return { id, name: id, dorsal: 1, position, status: "available", is_active: true, has_account: false };
}

const GOALKEEPER_SLOT = COURT_SLOTS[0];

describe("courtSlots", () => {
  it("coloca al portero en su sitio, junto a la portería", () => {
    const slots = courtSlots([player("a"), player("gk", "goalkeeper"), player("b")]);

    const keeper = slots.find((slot) => slot.player.id === "gk");
    expect(keeper).toMatchObject(GOALKEEPER_SLOT);
  });

  it("reparte a los de campo por el resto de posiciones, en el orden recibido", () => {
    const slots = courtSlots([
      player("gk", "goalkeeper"),
      player("a"),
      player("b"),
      player("c"),
      player("d"),
    ]);

    expect(slots.map(({ player: p, x, y }) => [p.id, x, y])).toEqual([
      ["gk", COURT_SLOTS[0].x, COURT_SLOTS[0].y],
      ["a", COURT_SLOTS[1].x, COURT_SLOTS[1].y],
      ["b", COURT_SLOTS[2].x, COURT_SLOTS[2].y],
      ["c", COURT_SLOTS[3].x, COURT_SLOTS[3].y],
      ["d", COURT_SLOTS[4].x, COURT_SLOTS[4].y],
    ]);
  });

  it("sin portero en pista, el quinto de campo ocupa el sitio del portero", () => {
    const slots = courtSlots(["a", "b", "c", "d", "e"].map((id) => player(id)));

    expect(slots.map((slot) => slot.player.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(slots.find((slot) => slot.player.id === "e")).toMatchObject(GOALKEEPER_SLOT);
  });

  it("con menos de cinco (por una roja) no deja a nadie sin sitio ni repite posición", () => {
    const slots = courtSlots([player("gk", "goalkeeper"), player("a"), player("b"), player("c")]);

    const keys = slots.map((slot) => `${slot.x},${slot.y}`);
    expect(slots).toHaveLength(4);
    expect(new Set(keys).size).toBe(4);
  });

  it("no oculta a nadie aunque haya más de cinco", () => {
    const six = ["a", "b", "c", "d", "e", "f"].map((id) => player(id));

    expect(courtSlots(six)).toHaveLength(6);
  });

  it("no modifica la lista recibida", () => {
    const input = [player("a"), player("gk", "goalkeeper")];
    const copy = [...input];

    courtSlots(input);

    expect(input).toEqual(copy);
  });

  it("todas las posiciones caen dentro de la cancha", () => {
    for (const slot of COURT_SLOTS) {
      expect(slot.x).toBeGreaterThan(0);
      expect(slot.x).toBeLessThan(100);
      expect(slot.y).toBeGreaterThan(0);
      expect(slot.y).toBeLessThan(100);
    }
  });
});
