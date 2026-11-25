import { describe, expect, it } from "vitest";

import { formatMoment, formatMoney, formatPoints, formatValueChange, lockText, payoutFor } from "./format";

describe("formatMoney", () => {
  it.each([
    [20000, "20,0 M"],
    [1000, "1,0 M"],
    [4200, "4,2 M"],
    [500, "0,5 M"],
    [0, "0,0 M"],
    [-1500, "-1,5 M"],
    [123456, "123,5 M"],
  ])("%i miles se muestran como %s", (thousands, text) => {
    expect(formatMoney(thousands)).toBe(text);
  });
});

describe("lockText", () => {
  it("avisa de que se bloquea al empezar el partido, con su día", () => {
    expect(lockText("2026-11-15")).toBe("Se bloquea al empezar el partido (domingo, 15 de noviembre)");
  });

  it("no se va al día anterior por la zona horaria", () => {
    expect(lockText("2026-07-05")).toBe("Se bloquea al empezar el partido (domingo, 5 de julio)");
  });
});

describe("formatPoints", () => {
  it("usa singular y plural", () => {
    expect(formatPoints(1)).toBe("1 punto");
    expect(formatPoints(0)).toBe("0 puntos");
    expect(formatPoints(13)).toBe("13 puntos");
  });
});

describe("formatValueChange", () => {
  it.each([
    [200, "+0,2 M"],
    [-400, "-0,4 M"],
    [0, "="],
  ])("%i miles se muestran como %s", (thousands, text) => {
    expect(formatValueChange(thousands)).toBe(text);
  });
});

describe("formatMoment", () => {
  it("da el día corto y la hora en Madrid (cierres y fichajes)", () => {
    expect(formatMoment("2026-11-14T23:00:00Z")).toBe("dom 15, 00:00");
  });
});

describe("payoutFor", () => {
  it("cobra 0,1 M por punto y nunca negativo", () => {
    expect(formatMoney(payoutFor(28))).toBe("2,8 M");
    expect(payoutFor(0)).toBe(0);
    expect(payoutFor(-3)).toBe(0);
  });
});
