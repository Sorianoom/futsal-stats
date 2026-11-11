import { describe, expect, it } from "vitest";

import { formatMoney, formatPoints, lockText } from "./format";

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
  it("da el día y la hora del bloqueo en Madrid, no en UTC", () => {
    expect(lockText("2026-11-14T23:00:00Z")).toBe("Se bloquea el domingo, 15 de noviembre a las 00:00");
  });

  it("acepta la hora con desfase", () => {
    expect(lockText("2026-07-05T00:00:00+02:00")).toBe("Se bloquea el domingo, 5 de julio a las 00:00");
  });
});

describe("formatPoints", () => {
  it("usa singular y plural", () => {
    expect(formatPoints(1)).toBe("1 punto");
    expect(formatPoints(0)).toBe("0 puntos");
    expect(formatPoints(13)).toBe("13 puntos");
  });
});
