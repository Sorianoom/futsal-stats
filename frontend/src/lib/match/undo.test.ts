import { describe, expect, it } from "vitest";

import type { LineupEventRecord, LoggedEvent } from "@/lib/api/match-types";

import { chooseUndo, describeUndo } from "./undo";

const STARTED: LineupEventRecord = {
  id: "l1",
  seq: 1,
  payload: { type: "part_started", part: 1, starters: ["p1", "p2", "p3", "p4", "p5"] },
};
const SUB: LineupEventRecord = {
  id: "l2",
  seq: 2,
  payload: { type: "substituted", t: 300, player_out: "p1", player_in: "p6" },
};
const SENT_OFF: LineupEventRecord = {
  id: "l3",
  seq: 3,
  payload: { type: "sent_off", t: 500, player_id: "p2" },
};
const END: LineupEventRecord = { id: "l9", seq: 9, payload: { type: "part_ended", t: 1200 } };

function event(id: string, kind: LoggedEvent["kind"], t: number, extra: Partial<LoggedEvent> = {}): LoggedEvent {
  return { id, seq: Number(id.slice(1)), kind, part: 1, t, player_id: "p3", voids_event_id: null, ...extra };
}

const NO_SESSION = new Map<string, number>();
const names: Record<string, string> = { p1: "Ana", p2: "Bea", p3: "Carla", p6: "Fer" };
const nameOf = (id: string) => names[id] ?? id;
const mmss = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;

describe("qué deshace el botón", () => {
  it("sin nada anotado no hay nada que deshacer", () => {
    expect(chooseUndo([], [], NO_SESSION)).toBeNull();
  });

  it("un evento posterior al último cambio se deshace antes", () => {
    const goal = event("e1", "goal", 400);

    expect(chooseUndo([STARTED, SUB], [goal], NO_SESSION)).toEqual({ kind: "event", event: goal });
  });

  it("un cambio posterior al último evento se deshace antes", () => {
    const goal = event("e1", "goal", 200);

    expect(chooseUndo([STARTED, SUB], [goal], NO_SESSION)).toEqual({ kind: "lineup", record: SUB, part: 1 });
  });

  it("a igual tiempo, lo anotado en esta sesión manda sobre la heurística", () => {
    const goal = event("e1", "goal", 300);
    const order = new Map([
      ["e1", 1],
      ["l2", 2],
    ]);

    expect(chooseUndo([STARTED, SUB], [goal], order)).toMatchObject({ kind: "lineup", record: SUB });
    expect(chooseUndo([STARTED, SUB], [goal], NO_SESSION)).toMatchObject({ kind: "event" });
  });

  it("el fin de parte va después de los eventos de esa parte", () => {
    const goal = event("e1", "goal", 1200);

    expect(chooseUndo([STARTED, END], [goal], NO_SESSION)).toMatchObject({ kind: "lineup", record: END });
  });

  it("el inicio de una parte va antes que sus eventos", () => {
    const second: LineupEventRecord = { id: "l10", seq: 10, payload: { type: "part_started", part: 2, starters: ["p1"] } };
    const goal = event("e1", "goal", 0, { part: 2 });

    expect(chooseUndo([STARTED, END, second], [goal], NO_SESSION)).toMatchObject({ kind: "event" });
    expect(chooseUndo([STARTED, END, second], [], NO_SESSION)).toMatchObject({ kind: "lineup", part: 2 });
  });

  it("la roja se deshace junto con su expulsión", () => {
    const red = event("e1", "red", 500, { player_id: "p2" });

    expect(chooseUndo([STARTED, SENT_OFF], [red], NO_SESSION)).toEqual({ kind: "red", event: red, record: SENT_OFF });
  });

  it("una roja sin su expulsión como último movimiento no se puede deshacer desde aquí", () => {
    const red = event("e1", "red", 500, { player_id: "p2" });

    expect(chooseUndo([STARTED], [red], NO_SESSION)).toEqual({ kind: "blocked", event: red });
  });

  it("lo ya deshecho no cuenta", () => {
    const goal = event("e1", "goal", 400);
    const undo = event("e2", "undo", 400, { player_id: null, voids_event_id: "e1" });
    const undoSub: LineupEventRecord = { id: "l4", seq: 4, payload: { type: "undo", voids_event_id: "l2" } };

    expect(chooseUndo([STARTED, SUB, undoSub], [goal, undo], NO_SESSION)).toMatchObject({
      kind: "lineup",
      record: STARTED,
    });
  });

  it("un registro incoherente no ofrece nada que deshacer", () => {
    const bad: LineupEventRecord = { id: "l4", seq: 4, payload: { type: "undo", voids_event_id: "l1" } };

    expect(chooseUndo([STARTED, SUB, bad], [], NO_SESSION)).toBeNull();
  });
});

describe("texto del botón de deshacer", () => {
  it.each([
    [{ kind: "lineup", record: SUB, part: 1 } as const, "Deshacer cambio: entra Fer, sale Ana (05:00)"],
    [{ kind: "lineup", record: END, part: 1 } as const, "Deshacer fin de la 1ª parte (20:00)"],
    [{ kind: "lineup", record: STARTED, part: 1 } as const, "Deshacer inicio de la 1ª parte"],
    [{ kind: "lineup", record: SENT_OFF, part: 1 } as const, "Deshacer expulsión de Bea (08:20)"],
    [{ kind: "event", event: event("e1", "goal", 75) } as const, "Deshacer gol de Carla (01:15)"],
    [
      { kind: "event", event: event("e1", "rival_goal", 75, { player_id: null }) } as const,
      "Deshacer gol rival (01:15)",
    ],
    [
      { kind: "red", event: event("e1", "red", 500, { player_id: "p2" }), record: SENT_OFF } as const,
      "Deshacer roja de Bea (08:20)",
    ],
  ])("%#", (action, text) => {
    expect(describeUndo(action, nameOf, mmss)).toBe(text);
  });
});
