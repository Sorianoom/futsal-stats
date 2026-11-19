import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LineupError,
  applySubstitutions,
  effectiveLineup,
  lineupUndoTarget,
  onCourt,
  replay,
  replayRecords,
  secondsByPlayer,
  type LineupPayload,
} from "./lineup";

interface Rec {
  id: string;
  payload: LineupPayload;
}

/** Caso dorado compartido con el backend (`backend/tests/domain/stints/test_lineup_undo.py`). */
interface Golden {
  records: Rec[];
  expected: { effective_ids: string[]; sent_off: string[]; seconds_by_player: Record<string, number> };
  partial: { until: string; current_part: number; clock: number; on_court: string[]; undo_target: string };
  invalid: { description: string; records: Rec[] }[];
}

const FIXTURE = resolve(process.cwd(), "..", "shared", "fixtures", "lineup_undo.json");
const golden = JSON.parse(readFileSync(FIXTURE, "utf-8")) as Golden;

const STARTED: Rec = {
  id: "l1",
  payload: { type: "part_started", part: 1, starters: ["p1", "p2", "p3", "p4", "p5"] },
};
const SUB: Rec = { id: "l2", payload: { type: "substituted", t: 300, player_out: "p1", player_in: "p6" } };
const END: Rec = { id: "l3", payload: { type: "part_ended", t: 1200 } };
const undo = (id: string, voids: string): Rec => ({
  id,
  payload: { type: "undo", voids_event_id: voids },
});

describe("deshacer movimientos de alineación", () => {
  it("sin deshacer cuentan todos los movimientos", () => {
    expect(effectiveLineup([STARTED, SUB, END])).toEqual([STARTED, SUB, END]);
  });

  it("deshacer quita el último movimiento y el propio deshacer", () => {
    expect(effectiveLineup([STARTED, SUB, END, undo("u1", "l3")])).toEqual([STARTED, SUB]);
  });

  it("encadenar deshaceres va hacia atrás uno a uno", () => {
    const records = [STARTED, SUB, END, undo("u1", "l3"), undo("u2", "l2")];

    expect(effectiveLineup(records)).toEqual([STARTED]);
    expect(lineupUndoTarget(records)).toEqual(STARTED);
  });

  it("solo se puede deshacer el último movimiento", () => {
    expect(() => effectiveLineup([STARTED, SUB, END, undo("u1", "l2")])).toThrow(/último/);
  });

  it("deshacer algo desconocido es un error", () => {
    expect(() => effectiveLineup([STARTED, undo("u1", "zz")])).toThrow(/desconocido/);
  });

  it("deshacer el fin de parte reabre la parte con el reloj del último cambio", () => {
    const state = replayRecords([STARTED, SUB, END, undo("u1", "l3")]);

    expect(state.currentPart).toBe(1);
    expect(state.clock).toBe(300);
    expect([...onCourt(state)].sort()).toEqual(["p2", "p3", "p4", "p5", "p6"]);
  });

  it("sin movimientos no hay nada que deshacer", () => {
    expect(lineupUndoTarget([])).toBeNull();
  });
});

describe("caso dorado de deshacer compartido con Python", () => {
  it("cuenta los mismos movimientos vigentes", () => {
    expect(effectiveLineup(golden.records).map((r) => r.id)).toEqual(golden.expected.effective_ids);
  });

  it("calcula los mismos minutos sin lo deshecho", () => {
    const state = replayRecords(golden.records);

    expect(state.open).toEqual([]);
    expect([...state.sentOff].sort()).toEqual(golden.expected.sent_off);
    expect(secondsByPlayer(state.closed)).toEqual(golden.expected.seconds_by_player);
  });

  it("a mitad del registro la parte se ha reabierto", () => {
    const until = golden.records.findIndex((r) => r.id === golden.partial.until);
    const records = golden.records.slice(0, until + 1);

    const state = replayRecords(records);

    expect(state.currentPart).toBe(golden.partial.current_part);
    expect(state.clock).toBe(golden.partial.clock);
    expect([...onCourt(state)].sort()).toEqual(golden.partial.on_court);
    expect(lineupUndoTarget(records)?.id).toBe(golden.partial.undo_target);
  });

  it.each(golden.invalid.map((c) => [c.description, c.records] as const))("%s es un error", (_, records) => {
    expect(() => effectiveLineup(records)).toThrow(LineupError);
  });
});

describe("varios cambios a la vez", () => {
  const state = replay([STARTED.payload as never]);

  it("aplica todos los pares con el mismo tiempo", () => {
    const next = applySubstitutions(state, 400, [
      { out: "p1", in: "p6" },
      { out: "p2", in: "p7" },
    ]);

    expect([...onCourt(next)].sort()).toEqual(["p3", "p4", "p5", "p6", "p7"]);
    expect(next.clock).toBe(400);
  });

  it("rechaza un jugador repetido en dos pares", () => {
    expect(() =>
      applySubstitutions(state, 400, [
        { out: "p1", in: "p6" },
        { out: "p6", in: "p7" },
      ]),
    ).toThrow(/más de un cambio/);
  });

  it("rechaza un par imposible y no hace ninguno", () => {
    expect(() =>
      applySubstitutions(state, 400, [
        { out: "p1", in: "p6" },
        { out: "p9", in: "p7" },
      ]),
    ).toThrow(/p9 no está en pista/);
  });

  it("rechaza una lista vacía", () => {
    expect(() => applySubstitutions(state, 400, [])).toThrow(/ningún cambio/);
  });
});
