import { describe, expect, it } from "vitest";

import type { EventIn, LineupEventRecord, LoggedEvent, RatingIn } from "@/lib/api/match-types";

import { confirmedOf, EMPTY_OUTBOX, restoreOutbox, size, without, type Outbox } from "./outbox";

const STARTED: LineupEventRecord = {
  id: "l1",
  seq: 1,
  payload: { type: "part_started", part: 1, starters: ["p1", "p2", "p3", "p4", "p5"] },
};
const SUBSTITUTION: LineupEventRecord = {
  id: "l2",
  seq: 2,
  payload: { type: "substituted", t: 60, player_out: "p1", player_in: "p6" },
};
const GOAL_IN: EventIn = { id: "e1", seq: 1, kind: "goal", part: 1, t: 100, player_id: "p1" };
const FOUL_IN: EventIn = { id: "e2", seq: 2, kind: "foul", part: 1, t: 130, player_id: "p2" };
const GOAL_LOGGED: LoggedEvent = {
  id: "e1",
  seq: 1,
  kind: "goal",
  part: 1,
  t: 100,
  player_id: "p1",
  voids_event_id: null,
};
const RATING: RatingIn = { id: "r1", part: 1, t: 200, stars: 4 };

function outbox(partial: Partial<Outbox>): Outbox {
  return { ...EMPTY_OUTBOX, ...partial };
}

describe("size y without", () => {
  it("cuenta lo pendiente de las tres colas", () => {
    expect(size(outbox({ lineup: [STARTED], events: [GOAL_IN, FOUL_IN], ratings: [RATING] }))).toBe(4);
    expect(size(EMPTY_OUTBOX)).toBe(0);
  });

  it("quita por id sin tocar el original", () => {
    const original = outbox({ lineup: [STARTED], events: [GOAL_IN], ratings: [RATING] });

    const result = without(original, new Set(["e1", "r1"]));

    expect(result).toEqual(outbox({ lineup: [STARTED] }));
    expect(original.events).toHaveLength(1);
  });
});

describe("confirmedOf", () => {
  const FOUL_LOGGED: LoggedEvent = { ...GOAL_LOGGED, id: "e2", seq: 2, kind: "foul", t: 130 };

  it("con la bandeja vacía devuelve todo tal cual", () => {
    const confirmed = confirmedOf([STARTED, SUBSTITUTION], [GOAL_LOGGED], EMPTY_OUTBOX);

    expect(confirmed.lineup).toEqual([STARTED, SUBSTITUTION]);
    expect(confirmed.events).toEqual([GOAL_LOGGED]);
  });

  it("quita lo que sigue pendiente de enviar", () => {
    const pending = outbox({ lineup: [SUBSTITUTION], events: [FOUL_IN] });

    const confirmed = confirmedOf([STARTED, SUBSTITUTION], [GOAL_LOGGED, FOUL_LOGGED], pending);

    expect(confirmed.lineup.map((item) => item.id)).toEqual(["l1"]);
    expect(confirmed.events.map((item) => item.id)).toEqual(["e1"]);
  });

  it("las valoraciones pendientes no afectan a la vista confirmada", () => {
    const confirmed = confirmedOf([STARTED], [GOAL_LOGGED], outbox({ ratings: [RATING] }));

    expect(confirmed.lineup).toEqual([STARTED]);
    expect(confirmed.events).toEqual([GOAL_LOGGED]);
  });

  it("no modifica las entradas", () => {
    const lineup = [STARTED, SUBSTITUTION];
    const events = [GOAL_LOGGED, FOUL_LOGGED];

    confirmedOf(lineup, events, outbox({ lineup: [SUBSTITUTION], events: [FOUL_IN] }));

    expect(lineup).toHaveLength(2);
    expect(events).toHaveLength(2);
  });
});

describe("restoreOutbox", () => {
  it("sin nada guardado deja los datos del servidor tal cual", () => {
    const restored = restoreOutbox(EMPTY_OUTBOX, [STARTED], [GOAL_LOGGED]);

    expect(restored.lineup).toEqual([STARTED]);
    expect(restored.events).toEqual([GOAL_LOGGED]);
    expect(restored.outbox).toEqual(EMPTY_OUTBOX);
    expect(restored.recovered).toEqual(new Set());
  });

  it("añade a la vista lo guardado que el servidor no tiene", () => {
    const saved = outbox({ lineup: [SUBSTITUTION], events: [FOUL_IN], ratings: [RATING] });

    const restored = restoreOutbox(saved, [STARTED], [GOAL_LOGGED]);

    expect(restored.lineup.map((item) => item.id)).toEqual(["l1", "l2"]);
    expect(restored.events.map((item) => item.id)).toEqual(["e1", "e2"]);
    expect(restored.events[1]).toEqual({
      id: "e2",
      seq: 2,
      kind: "foul",
      part: 1,
      t: 130,
      player_id: "p2",
      voids_event_id: null,
    });
    expect(restored.outbox).toEqual(saved);
  });

  it("descarta lo guardado que el servidor ya tiene", () => {
    const saved = outbox({ lineup: [STARTED, SUBSTITUTION], events: [GOAL_IN, FOUL_IN] });

    const restored = restoreOutbox(saved, [STARTED], [GOAL_LOGGED]);

    expect(restored.outbox.lineup.map((item) => item.id)).toEqual(["l2"]);
    expect(restored.outbox.events.map((item) => item.id)).toEqual(["e2"]);
    expect(restored.lineup.map((item) => item.id)).toEqual(["l1", "l2"]);
    expect(restored.events.map((item) => item.id)).toEqual(["e1", "e2"]);
  });

  it("marca como posiblemente enviado todo lo recuperado", () => {
    const saved = outbox({ lineup: [SUBSTITUTION], events: [FOUL_IN], ratings: [RATING] });

    const restored = restoreOutbox(saved, [STARTED], []);

    expect(restored.recovered).toEqual(new Set(["l2", "e2", "r1"]));
  });

  it("ordena por seq lo que mezcla servidor y bandeja", () => {
    const early: EventIn = { ...FOUL_IN, id: "e0", seq: 0 };

    const restored = restoreOutbox(outbox({ events: [early] }), [], [GOAL_LOGGED]);

    expect(restored.events.map((item) => item.seq)).toEqual([0, 1]);
  });

  it("no modifica las entradas", () => {
    const saved = outbox({ events: [FOUL_IN] });
    const serverEvents = [GOAL_LOGGED];

    restoreOutbox(saved, [STARTED], serverEvents);

    expect(serverEvents).toHaveLength(1);
    expect(saved.events).toHaveLength(1);
  });
});
