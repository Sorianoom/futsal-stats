import { describe, expect, it } from "vitest";

import {
  EventError,
  effectiveEvents,
  score,
  teamFoulsByPart,
  undoTarget,
  type MatchEvent,
} from "./events";

let counter = 0;

function event(overrides: Partial<MatchEvent> & Pick<MatchEvent, "kind">): MatchEvent {
  counter += 1;
  return {
    id: `e${counter}`,
    part: 1,
    t: counter,
    player_id: overrides.kind === "rival_goal" || overrides.kind === "undo" ? null : "p1",
    voids_event_id: null,
    ...overrides,
  };
}

function undo(target: MatchEvent): MatchEvent {
  return event({ kind: "undo", voids_event_id: target.id });
}

describe("effectiveEvents", () => {
  it("conserva los eventos normales y quita los deshechos y los propios deshacer", () => {
    const goal = event({ kind: "goal" });
    const foul = event({ kind: "foul" });
    const log = [goal, foul, undo(foul)];

    expect(effectiveEvents(log)).toEqual([goal]);
  });

  it("rechaza ids duplicados", () => {
    const goal = event({ kind: "goal" });

    expect(() => effectiveEvents([goal, goal])).toThrow(EventError);
  });

  it.each([
    ["un deshacer sin objetivo", { kind: "undo" as const, voids_event_id: null }, /no indica qué/],
    ["un deshacer de un evento desconocido", { kind: "undo" as const, voids_event_id: "nada" }, /desconocido/],
  ])("rechaza %s", (_name, overrides, message) => {
    expect(() => effectiveEvents([event(overrides)])).toThrow(message);
  });

  it("rechaza deshacer un deshacer o deshacer dos veces el mismo evento", () => {
    const goal = event({ kind: "goal" });
    const first = undo(goal);

    expect(() => effectiveEvents([goal, first, undo(first)])).toThrow(/deshacer un deshacer/);
    expect(() => effectiveEvents([goal, first, undo(goal)])).toThrow(/ya estaba deshecho/);
  });
});

describe("undoTarget", () => {
  it("es el último evento efectivo", () => {
    const goal = event({ kind: "goal" });
    const foul = event({ kind: "foul" });

    expect(undoTarget([goal, foul])).toBe(foul);
    expect(undoTarget([goal, foul, undo(foul)])).toBe(goal);
  });

  it("es null si no queda nada que deshacer", () => {
    const goal = event({ kind: "goal" });

    expect(undoTarget([])).toBeNull();
    expect(undoTarget([goal, undo(goal)])).toBeNull();
  });
});

describe("teamFoulsByPart", () => {
  it("cuenta las faltas de cada parte sin las deshechas", () => {
    const first = event({ kind: "foul", part: 1 });
    const log = [
      first,
      event({ kind: "foul", part: 1 }),
      event({ kind: "foul", part: 2 }),
      event({ kind: "goal", part: 2 }),
      undo(first),
    ];

    expect(teamFoulsByPart(log)).toEqual({ 1: 1, 2: 1 });
  });
});

describe("score", () => {
  it("cuenta los goles propios y los del rival sin los deshechos", () => {
    const mistaken = event({ kind: "goal" });
    const log = [
      event({ kind: "goal" }),
      event({ kind: "goal", player_id: "p2" }),
      mistaken,
      undo(mistaken),
      event({ kind: "rival_goal" }),
      event({ kind: "shot" }),
    ];

    expect(score(log)).toEqual({ for: 2, against: 1 });
  });

  it("es 0-0 sin eventos", () => {
    expect(score([])).toEqual({ for: 0, against: 0 });
  });
});
