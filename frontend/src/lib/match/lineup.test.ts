import { describe, expect, it } from "vitest";

import {
  LineupError,
  applyEvent,
  emptyLineup,
  liveSecondsByPlayer,
  onCourt,
  replay,
  secondsByPlayer,
  type LineupEvent,
} from "./lineup";

const STARTERS = ["p1", "p2", "p3", "p4", "p5"];

function started(): ReturnType<typeof replay> {
  return replay([{ type: "part_started", part: 1, starters: STARTERS }]);
}

describe("inicio de parte", () => {
  it("abre un tramo en 0 por cada titular", () => {
    const state = started();

    expect(state.currentPart).toBe(1);
    expect([...onCourt(state)].sort()).toEqual(STARTERS);
    expect(state.open.every((stint) => stint.start === 0 && stint.part === 1)).toBe(true);
  });

  it.each([
    ["una parte inválida", { part: 3, starters: STARTERS }, /Parte inválida/],
    ["la parte 2 sin haber cerrado la 1", { part: 2, starters: STARTERS }, /no puede empezar/],
    ["titulares duplicados", { part: 1, starters: ["p1", "p1"] }, /duplicados/],
    ["más titulares que la capacidad", { part: 1, starters: [...STARTERS, "p6"] }, /capacidad/],
  ])("rechaza %s", (_name, event, message) => {
    expect(() => applyEvent(emptyLineup(), { type: "part_started", ...event })).toThrow(message);
  });

  it("no deja empezar otra parte con una en juego", () => {
    expect(() => applyEvent(started(), { type: "part_started", part: 2, starters: STARTERS })).toThrow(
      /Ya hay una parte en juego/,
    );
  });

  it("no deja que un expulsado sea titular de la parte 2", () => {
    const state = replay([
      { type: "part_started", part: 1, starters: STARTERS },
      { type: "sent_off", t: 100, player_id: "p3" },
      { type: "part_ended", t: 1200 },
    ]);

    expect(() =>
      applyEvent(state, { type: "part_started", part: 2, starters: ["p3", "p1", "p2", "p4"] }),
    ).toThrow(/expulsado/);
  });
});

describe("cambios", () => {
  it("cierra el tramo del que sale y abre el del que entra", () => {
    const state = applyEvent(started(), { type: "substituted", t: 300, player_out: "p1", player_in: "p6" });

    expect(onCourt(state)).toContain("p6");
    expect(onCourt(state)).not.toContain("p1");
    expect(state.closed).toEqual([{ player_id: "p1", part: 1, start: 0, end: 300 }]);
    expect(state.clock).toBe(300);
  });

  it("descarta un tramo de duración cero", () => {
    const state = applyEvent(started(), { type: "substituted", t: 0, player_out: "p1", player_in: "p6" });

    expect(state.closed).toEqual([]);
    expect(onCourt(state)).toContain("p6");
  });

  it.each([
    ["sacar a quien no está en pista", { player_out: "p9", player_in: "p6" }, /no está en pista/],
    ["meter a quien ya está en pista", { player_out: "p1", player_in: "p2" }, /ya está en pista/],
  ])("rechaza %s", (_name, change, message) => {
    expect(() => applyEvent(started(), { type: "substituted", t: 10, ...change })).toThrow(message);
  });

  it("rechaza un cambio sin parte en juego o con tiempo anterior al reloj", () => {
    expect(() =>
      applyEvent(emptyLineup(), { type: "substituted", t: 10, player_out: "p1", player_in: "p6" }),
    ).toThrow(/No hay ninguna parte/);
    const later = applyEvent(started(), { type: "substituted", t: 300, player_out: "p1", player_in: "p6" });
    expect(() =>
      applyEvent(later, { type: "substituted", t: 200, player_out: "p2", player_in: "p7" }),
    ).toThrow(/anterior al reloj/);
  });

  it("rechaza meter a un expulsado", () => {
    const state = applyEvent(started(), { type: "sent_off", t: 100, player_id: "p3" });

    expect(() =>
      applyEvent(state, { type: "substituted", t: 200, player_out: "p1", player_in: "p3" }),
    ).toThrow(/expulsado/);
  });
});

describe("expulsión y fin de parte", () => {
  it("la roja saca al jugador y reduce la capacidad a 4", () => {
    const state = applyEvent(started(), { type: "sent_off", t: 900, player_id: "p3" });

    expect(onCourt(state)).not.toContain("p3");
    expect(state.sentOff).toEqual(["p3"]);
    expect(state.closed).toEqual([{ player_id: "p3", part: 1, start: 0, end: 900 }]);
  });

  it("fin de parte cierra todos los tramos y libera la parte", () => {
    const state = applyEvent(started(), { type: "part_ended", t: 1200 });

    expect(state.currentPart).toBeNull();
    expect(state.lastEndedPart).toBe(1);
    expect(state.open).toEqual([]);
    expect(state.closed).toHaveLength(5);
  });

  it("no cambia el estado anterior al aplicar un evento", () => {
    const before = started();
    const snapshot = JSON.stringify(before);

    applyEvent(before, { type: "substituted", t: 300, player_out: "p1", player_in: "p6" });

    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("minutos", () => {
  it("suma los segundos de los tramos cerrados por jugador", () => {
    const state = replay([
      { type: "part_started", part: 1, starters: STARTERS },
      { type: "substituted", t: 300, player_out: "p1", player_in: "p6" },
      { type: "part_ended", t: 1200 },
    ]);

    expect(secondsByPlayer(state.closed)).toMatchObject({ p1: 300, p6: 900, p2: 1200 });
  });

  it("en directo incluye lo que llevan los que siguen en pista hasta un tiempo dado", () => {
    const state = applyEvent(started(), { type: "substituted", t: 300, player_out: "p1", player_in: "p6" });

    expect(liveSecondsByPlayer(state, 500)).toMatchObject({ p1: 300, p6: 200, p2: 500 });
  });

  it("rechaza un tiempo anterior al reloj al calcular los minutos en directo", () => {
    const state = applyEvent(started(), { type: "substituted", t: 300, player_out: "p1", player_in: "p6" });

    expect(() => liveSecondsByPlayer(state, 100)).toThrow(LineupError);
  });
});

describe("replay", () => {
  it("rehace el estado a partir de la secuencia de eventos", () => {
    const events: LineupEvent[] = [
      { type: "part_started", part: 1, starters: STARTERS },
      { type: "substituted", t: 60, player_out: "p5", player_in: "p6" },
    ];

    expect([...onCourt(replay(events))].sort()).toEqual(["p1", "p2", "p3", "p4", "p6"]);
  });
});
