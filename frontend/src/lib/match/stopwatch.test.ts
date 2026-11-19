import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  actionTime,
  elapsedSeconds,
  loadMatchClock,
  pause,
  saveMatchClock,
  setElapsed,
  settle,
  shiftDisplay,
  start,
  stoppedAt,
  toggle,
  type MatchClock,
} from "./stopwatch";

const PART = 1200;
const T0 = 1_700_000_000_000;
const seconds = (n: number) => n * 1000;

describe("cronómetro de la parte", () => {
  it("empieza parado en 0 jugados y parado no avanza aunque pase el tiempo", () => {
    const watch = stoppedAt(0);

    expect(watch.running).toBe(false);
    expect(elapsedSeconds(watch, T0 + seconds(500), PART)).toBe(0);
  });

  it("en marcha, lo jugado es la diferencia de horas: no depende de ticks", () => {
    const watch = start(stoppedAt(0), T0, PART);

    // Ni un solo tick en medio (iPad bloqueado, pestaña en segundo plano o recarga).
    expect(elapsedSeconds(watch, T0 + seconds(95), PART)).toBe(95);
    expect(elapsedSeconds(watch, T0 + seconds(95) + 999, PART)).toBe(95);
  });

  it("al pararlo conserva lo jugado, también las fracciones de segundo", () => {
    let watch = start(stoppedAt(0), T0, PART);
    watch = pause(watch, T0 + 10_600, PART);
    expect(watch.running).toBe(false);
    expect(elapsedSeconds(watch, T0 + seconds(999), PART)).toBe(10);

    watch = start(watch, T0 + seconds(100), PART);
    expect(elapsedSeconds(watch, T0 + seconds(100) + 400, PART)).toBe(11);
  });

  it("toggle arranca si está parado y para si está en marcha", () => {
    const running = toggle(stoppedAt(30), T0, PART);
    expect(running.running).toBe(true);

    const stopped = toggle(running, T0 + seconds(5), PART);
    expect(stopped.running).toBe(false);
    expect(elapsedSeconds(stopped, T0, PART)).toBe(35);
  });

  it("nunca pasa de la duración de la parte (el marcador se queda en 0:00)", () => {
    const watch = start(stoppedAt(1190), T0, PART);

    expect(elapsedSeconds(watch, T0 + seconds(60), PART)).toBe(PART);
  });

  it("se para solo al llegar a 0:00", () => {
    const watch = start(stoppedAt(1190), T0, PART);

    expect(settle(watch, T0 + seconds(5), PART)).toBe(watch);
    const ended = settle(watch, T0 + seconds(11), PART);
    expect(ended.running).toBe(false);
    expect(elapsedSeconds(ended, T0 + seconds(500), PART)).toBe(PART);
  });

  it("en 0:00 no se puede volver a arrancar", () => {
    const watch = stoppedAt(PART);

    expect(start(watch, T0, PART).running).toBe(false);
  });
});

describe("ajuste con la mesa", () => {
  it("+10 s sube el marcador (quita tiempo jugado) y −10 s lo baja, parado", () => {
    const watch = stoppedAt(300);

    expect(elapsedSeconds(shiftDisplay(watch, 10, T0, PART), T0, PART)).toBe(290);
    expect(elapsedSeconds(shiftDisplay(watch, -10, T0, PART), T0, PART)).toBe(310);
  });

  it("en marcha, el ajuste se aplica sin pararlo y sigue contando desde ahí", () => {
    const watch = start(stoppedAt(0), T0, PART);

    const adjusted = shiftDisplay(watch, 1, T0 + seconds(60), PART);

    expect(adjusted.running).toBe(true);
    expect(elapsedSeconds(adjusted, T0 + seconds(60), PART)).toBe(59);
    expect(elapsedSeconds(adjusted, T0 + seconds(70), PART)).toBe(69);
  });

  it("no sale de la parte por ningún lado", () => {
    expect(elapsedSeconds(shiftDisplay(stoppedAt(5), 10, T0, PART), T0, PART)).toBe(0);
    expect(elapsedSeconds(shiftDisplay(stoppedAt(1195), -10, T0, PART), T0, PART)).toBe(PART);
  });

  it("si un ajuste lo lleva a 0:00 en marcha, se para", () => {
    const watch = start(stoppedAt(1195), T0, PART);

    expect(shiftDisplay(watch, -10, T0, PART).running).toBe(false);
  });

  it("se puede poner el tiempo exacto, hacia delante y hacia atrás", () => {
    const watch = start(stoppedAt(0), T0, PART);

    const back = setElapsed(watch, 120, T0 + seconds(600), PART);
    expect(back.running).toBe(true);
    expect(elapsedSeconds(back, T0 + seconds(600), PART)).toBe(120);
    expect(elapsedSeconds(setElapsed(back, 900, T0, PART), T0, PART)).toBe(900);
  });
});

describe("tiempo de una acción", () => {
  it("es el del reloj si no va por detrás del último movimiento", () => {
    expect(actionTime(500, 300)).toEqual({ t: 500, behind: false });
    expect(actionTime(300, 300)).toEqual({ t: 300, behind: false });
  });

  // Decisión: nunca se bloquea al entrenador por el tiempo. Si el reloj se ajustó hacia atrás y
  // marca antes del último cambio, la acción se anota en el último movimiento (el dominio exige
  // un reloj que no retrocede) y la pantalla solo lo avisa.
  it("si el reloj va por detrás del último movimiento, usa el último movimiento y lo marca", () => {
    expect(actionTime(250, 300)).toEqual({ t: 300, behind: true });
  });
});

describe("guardado por partido", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("guarda y recupera la parte, la duración y el cronómetro", () => {
    const clock: MatchClock = { part: 2, partSeconds: 1500, watch: start(stoppedAt(30), T0, 1500) };

    saveMatchClock("m1", clock);

    expect(loadMatchClock("m1")).toEqual(clock);
    expect(loadMatchClock("m2")).toBeNull();
  });

  it("descarta lo guardado si no tiene forma de cronómetro", () => {
    window.localStorage.setItem("futsal:stopwatch:m1", JSON.stringify({ part: 1, partSeconds: -5 }));
    expect(loadMatchClock("m1")).toBeNull();

    window.localStorage.setItem("futsal:stopwatch:m1", "{no es json");
    expect(loadMatchClock("m1")).toBeNull();
  });
});
