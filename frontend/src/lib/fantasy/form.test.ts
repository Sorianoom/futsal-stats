import { describe, expect, it } from "vitest";

import { hotPoints, hottest, tierOf } from "./form";

describe("forma de un jugador", () => {
  it("8 o más es buena jornada, 4 o menos mala y sin datos cuenta como normal", () => {
    expect(tierOf(8)).toBe("good");
    expect(tierOf(5)).toBe("mid");
    expect(tierOf(4)).toBe("poor");
    expect(tierOf(null)).toBe("mid");
  });

  it("la racha suma las 3 últimas jornadas", () => {
    expect(hotPoints([1, 9, 8, 10])).toBe(27);
    expect(hotPoints([])).toBe(0);
  });

  it("el más en racha es el que más suma; sin puntos no hay ninguno", () => {
    const items = [
      { id: "a", recent_points: [5, 5, 5] },
      { id: "b", recent_points: [9, 8, 10] },
      { id: "c", recent_points: [10, 9, 8] },
    ];
    expect(hottest(items)?.id).toBe("b");
    expect(hottest([{ id: "x", recent_points: [0, 0] }, { id: "y" }])).toBeNull();
  });
});
