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
  shiftDisplay,
  suggestElapsed,
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

  it("el borde de la parte: 20:00 es el inicio y 20:01 no existe", () => {
    expect(parseScoreboard("2000", DOWN)).toEqual({ ok: true, elapsed: 0 });
    expect(parseScoreboard("2001", DOWN)).toEqual({
      ok: false,
      error: "Ese tiempo no cabe en una parte de 20:00",
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

describe("suggestElapsed", () => {
  const base = { lastElapsed: 300, lastAt: 1_000_000, maxElapsed: 1200 };

  it("suma el tiempo real transcurrido desde el último tiempo confirmado, de 10 en 10 segundos", () => {
    expect(suggestElapsed({ ...base, nowMs: 1_000_000 + 94_000 })).toBe(390);
  });

  it("con poco tiempo transcurrido no se mueve del último tiempo", () => {
    expect(suggestElapsed({ ...base, nowMs: 1_000_000 + 9_000 })).toBe(300);
  });

  it("sin referencia de tiempo real (tras recargar) devuelve el último tiempo", () => {
    expect(suggestElapsed({ ...base, lastAt: null, nowMs: 9_000_000 })).toBe(300);
  });

  it("no pasa del final de la parte", () => {
    expect(suggestElapsed({ ...base, nowMs: 1_000_000 + 3_600_000 })).toBe(1200);
  });

  it("si el reloj del dispositivo retrocede no baja del último tiempo", () => {
    expect(suggestElapsed({ ...base, nowMs: 1_000_000 - 60_000 })).toBe(300);
  });
});

describe("shiftDisplay", () => {
  it("con el marcador hacia abajo, +20 s sube lo que se ve y retrasa lo jugado hacia atrás", () => {
    expect(shiftDisplay(300, 20, DOWN)).toBe(280);
    expect(shiftDisplay(300, -60, DOWN)).toBe(360);
  });

  it("con el marcador hacia arriba, +20 s suma a lo jugado", () => {
    expect(shiftDisplay(300, 20, UP)).toBe(320);
    expect(shiftDisplay(300, -60, UP)).toBe(240);
  });

  it("no baja del mínimo permitido", () => {
    expect(shiftDisplay(300, -60, UP, 280)).toBe(280);
    expect(shiftDisplay(300, 60, DOWN, 280)).toBe(280);
  });

  it("no sale de la parte", () => {
    expect(shiftDisplay(1190, 60, UP)).toBe(1200);
    expect(shiftDisplay(10, 60, DOWN)).toBe(0);
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
