import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_CLOCK,
  digitsToSeconds,
  elapsedToDisplay,
  formatClock,
  loadClockSettings,
  parseScoreboard,
  saveClockSettings,
  secondsToDigits,
  type ClockSettings,
} from "./clock";

const DOWN: ClockSettings = { direction: "down", partSeconds: 1200 };
const UP: ClockSettings = { direction: "up", partSeconds: 1200 };

describe("formatClock", () => {
  it.each([
    [0, "00:00"],
    [65, "01:05"],
    [750, "12:30"],
    [1200, "20:00"],
  ])("%i segundos se ven como %s", (seconds, text) => {
    expect(formatClock(seconds)).toBe(text);
  });
});

describe("digitsToSeconds y secondsToDigits", () => {
  it.each([
    ["", 0],
    ["5", 5],
    ["130", 90],
    ["1230", 750],
  ])("los dígitos %j son %i segundos", (digits, seconds) => {
    expect(digitsToSeconds(digits)).toBe(seconds);
  });

  it("ida y vuelta de segundos a dígitos", () => {
    expect(secondsToDigits(750)).toBe("1230");
    expect(secondsToDigits(0)).toBe("");
    expect(digitsToSeconds(secondsToDigits(1195))).toBe(1195);
  });
});

describe("conversión entre marcador y tiempo jugado", () => {
  it("con el marcador hacia abajo, lo jugado es la duración menos lo que marca", () => {
    expect(parseScoreboard("2000", DOWN)).toEqual({ ok: true, elapsed: 0 });
    expect(parseScoreboard("1500", DOWN)).toEqual({ ok: true, elapsed: 300 });
    expect(parseScoreboard("0", DOWN)).toEqual({ ok: true, elapsed: 1200 });
  });

  it("con el marcador hacia arriba, lo jugado es lo que marca", () => {
    expect(parseScoreboard("500", UP)).toEqual({ ok: true, elapsed: 300 });
    expect(parseScoreboard("2000", UP)).toEqual({ ok: true, elapsed: 1200 });
  });

  it("elapsedToDisplay es la inversa", () => {
    expect(elapsedToDisplay(300, DOWN)).toBe(900);
    expect(elapsedToDisplay(300, UP)).toBe(300);
    expect(parseScoreboard(secondsToDigits(elapsedToDisplay(777, DOWN)), DOWN)).toEqual({
      ok: true,
      elapsed: 777,
    });
  });

  it("rechaza segundos mayores que 59", () => {
    expect(parseScoreboard("1275", DOWN)).toEqual({
      ok: false,
      error: "Los segundos van de 00 a 59",
    });
  });

  it("rechaza un tiempo que no cabe en la parte", () => {
    expect(parseScoreboard("2100", DOWN)).toEqual({
      ok: false,
      error: "Ese tiempo no cabe en una parte de 20:00",
    });
    expect(parseScoreboard("2100", UP)).toEqual({
      ok: false,
      error: "Ese tiempo no cabe en una parte de 20:00",
    });
  });
});

describe("ajustes del reloj guardados en el navegador", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("por defecto el marcador baja desde 20:00", () => {
    expect(DEFAULT_CLOCK).toEqual({ direction: "down", partSeconds: 1200 });
    expect(loadClockSettings()).toEqual(DEFAULT_CLOCK);
  });

  it("recuerda lo último que se eligió", () => {
    saveClockSettings(UP);

    expect(loadClockSettings()).toEqual(UP);
  });

  it("ignora un valor guardado que no es válido", () => {
    window.localStorage.setItem("futsal:clock", "{no es json");
    expect(loadClockSettings()).toEqual(DEFAULT_CLOCK);

    window.localStorage.setItem(
      "futsal:clock",
      JSON.stringify({ direction: "sideways", partSeconds: -5 }),
    );
    expect(loadClockSettings()).toEqual(DEFAULT_CLOCK);
  });
});
