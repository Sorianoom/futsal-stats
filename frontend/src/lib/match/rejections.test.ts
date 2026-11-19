import { afterEach, describe, expect, it, vi } from "vitest";

import { describeRejection, loadRejections, saveRejections } from "./rejections";

const nameOf = (id: string) => ({ p1: "Ana", p6: "Fer" })[id] ?? id;
const time = (t: number) => `t${t}`;

describe("describeRejection", () => {
  it.each([
    [
      { id: "e1", reason: "unknown_player", event: { id: "e1", seq: 1, kind: "goal", part: 1, t: 5, player_id: "p1", voids_event_id: null } },
      "Gol de Ana (t5): jugador desconocido",
    ],
    [
      { id: "l1", reason: "void_not_last", lineup: { id: "l1", seq: 1, payload: { type: "undo", voids_event_id: "x" } } },
      "Deshacer un movimiento de alineación: no era el último movimiento",
    ],
    [
      { id: "l2", reason: "unknown_player", lineup: { id: "l2", seq: 2, payload: { type: "substituted", t: 9, player_out: "p1", player_in: "p6" } } },
      "Cambio: entra Fer, sale Ana (t9): jugador desconocido",
    ],
    [{ id: "r1", reason: "raro", rating: { id: "r1", part: 1, t: 3, stars: 4 } }, "Valoración de 4 estrellas (t3): raro"],
    [{ id: "z", reason: "raro" }, "Algo anotado: raro"],
  ] as const)("%#", (rejection, text) => {
    expect(describeRejection(rejection as never, nameOf, time)).toBe(text);
  });
});

describe("rechazos guardados en el dispositivo", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("se guardan por partido y se recuperan tal cual", () => {
    const items = [{ id: "e1", reason: "unknown_player" }];
    saveRejections("m1", items);

    expect(loadRejections("m1")).toEqual(items);
    expect(loadRejections("m2")).toEqual([]);
  });

  it("guardar una lista vacía los borra", () => {
    saveRejections("m1", [{ id: "e1", reason: "unknown_player" }]);
    saveRejections("m1", []);

    expect(loadRejections("m1")).toEqual([]);
    expect(window.localStorage.length).toBe(0);
  });

  it("ignora lo guardado si no tiene la forma esperada", () => {
    window.localStorage.setItem("futsal:rejections:m1", JSON.stringify([{ id: 1 }]));
    expect(loadRejections("m1")).toEqual([]);
    window.localStorage.setItem("futsal:rejections:m1", "{no es json");
    expect(loadRejections("m1")).toEqual([]);
  });

  it("sin almacenamiento disponible no falla", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(() => saveRejections("m1", [{ id: "e1", reason: "unknown_player" }])).not.toThrow();
    expect(loadRejections("m1")).toEqual([]);
  });
});
