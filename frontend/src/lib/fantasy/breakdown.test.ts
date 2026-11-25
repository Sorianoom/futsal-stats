import { describe, expect, it } from "vitest";

import { breakdownLabel, formatContribution, formatScore, roundedScore } from "./breakdown";

describe("breakdownLabel", () => {
  it("nombra cada acción en singular o plural", () => {
    expect(breakdownLabel({ key: "base", count: 1, points: 5.4 })).toBe("Base");
    expect(breakdownLabel({ key: "goals", count: 1, points: 1.5 })).toBe("1 gol");
    expect(breakdownLabel({ key: "saves", count: 17, points: 6.8 })).toBe("17 paradas");
    expect(breakdownLabel({ key: "clean_streaks", count: 2, points: 0.6 })).toBe("2 rachas de 10′ sin gol en contra");
    expect(breakdownLabel({ key: "goals_against_on_court", count: 1, points: -0.15 })).toBe(
      "1 gol en contra con él en pista",
    );
  });

  it("una acción desconocida enseña su clave", () => {
    expect(breakdownLabel({ key: "nueva", count: 2, points: 1 })).toBe("2 × nueva");
  });
});

describe("formatContribution", () => {
  it("lleva signo y una o dos cifras decimales", () => {
    expect(formatContribution(3)).toBe("+3,0");
    expect(formatContribution(0.15)).toBe("+0,15");
    expect(formatContribution(-2)).toBe("−2,0");
  });
});

describe("roundedScore", () => {
  it("redondea ,5 hacia arriba sin que la coma flotante lo tuerza", () => {
    expect(roundedScore(10.7)).toBe(11);
    expect(roundedScore(8.5)).toBe(9);
    expect(roundedScore(5.45)).toBe(5);
    expect(roundedScore(-0.7)).toBe(-1);
  });
});

describe("formatScore", () => {
  it("no esconde las centésimas que deciden el redondeo", () => {
    expect(formatScore(8.45)).toBe("8,45");
    expect(formatScore(10.7)).toBe("10,7");
    expect(formatScore(6)).toBe("6,0");
  });
});
