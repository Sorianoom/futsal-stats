import { describe, expect, it } from "vitest";

import { bankSalePrice, closingIn, millionsInput, parseMillions } from "./market";

describe("parseMillions", () => {
  it.each([
    ["4,5", 4500],
    ["4.5", 4500],
    ["4", 4000],
    [" 12,25 ", 12250],
    ["0,001", 1],
    ["0", 0],
    ["1000", 1000000],
    ["4,", 4000],
    [",5", 500],
  ])("«%s» M son %i miles", (text, thousands) => {
    expect(parseMillions(text)).toEqual({ ok: true, thousands });
  });

  it("vacío no es ningún importe", () => {
    expect(parseMillions("   ")).toEqual({ ok: true, thousands: null });
  });

  it.each(["abc", "4,5,1", "-1", "1e3", "4 5", "0,0005", "1000,1"])("rechaza «%s»", (text) => {
    expect(parseMillions(text).ok).toBe(false);
  });
});

describe("bankSalePrice", () => {
  it.each([
    [4000, 2800],
    [4200, 2940],
    [500, 350],
    [4201, 2940],
    [0, 0],
  ])("el 70 %% de %i miles redondeado hacia abajo es %i", (value, price) => {
    expect(bankSalePrice(value)).toBe(price);
  });
});

describe("closingIn", () => {
  const NOW = new Date("2026-11-14T10:00:00Z");

  it.each([
    ["2026-11-14T23:00:00Z", "13 h 0 min"],
    ["2026-11-14T13:25:30Z", "3 h 25 min"],
    ["2026-11-14T10:12:00Z", "12 min"],
    ["2026-11-14T10:00:30Z", "menos de 1 min"],
  ])("hasta %s faltan %s", (closesAt, text) => {
    expect(closingIn(closesAt, NOW)).toBe(text);
  });

  it("si ya pasó la hora dice que está cerrando", () => {
    expect(closingIn("2026-11-14T09:59:00Z", NOW)).toBe("cerrando");
  });
});

describe("millionsInput", () => {
  it.each([
    [5500, "5,5"],
    [4000, "4"],
    [12250, "12,25"],
    [1, "0,001"],
    [1000000, "1000"],
  ])("%i miles se proponen como «%s» y se vuelven a leer igual", (thousands, text) => {
    expect(millionsInput(thousands)).toBe(text);
    expect(parseMillions(text)).toEqual({ ok: true, thousands });
  });
});
