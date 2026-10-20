import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";

import type { EventIn, LineupEventRecord, RatingIn } from "@/lib/api/match-types";

import { EMPTY_OUTBOX, type Outbox } from "./outbox";
import { loadOutbox, saveOutbox } from "./outbox-store";

const STARTED: LineupEventRecord = {
  id: "l1",
  seq: 1,
  payload: { type: "part_started", part: 1, starters: ["p1", "p2", "p3", "p4", "p5"] },
};
const GOAL: EventIn = { id: "e1", seq: 1, kind: "goal", part: 1, t: 100, player_id: "p1" };
const RATING: RatingIn = { id: "r1", part: 1, t: 200, stars: 4 };
const FULL: Outbox = { lineup: [STARTED], events: [GOAL], ratings: [RATING] };

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("outbox-store", () => {
  it("devuelve la bandeja vacía si no hay nada guardado", async () => {
    expect(await loadOutbox("m1")).toEqual(EMPTY_OUTBOX);
  });

  it("recupera lo guardado", async () => {
    await saveOutbox("m1", FULL);

    expect(await loadOutbox("m1")).toEqual(FULL);
  });

  it("guarda cada partido por separado", async () => {
    await saveOutbox("m1", FULL);
    await saveOutbox("m2", { ...EMPTY_OUTBOX, events: [GOAL] });

    expect(await loadOutbox("m1")).toEqual(FULL);
    expect((await loadOutbox("m2")).events).toEqual([GOAL]);
  });

  it("guardar una bandeja nueva sustituye a la anterior", async () => {
    await saveOutbox("m1", FULL);
    await saveOutbox("m1", { ...EMPTY_OUTBOX, ratings: [RATING] });

    expect(await loadOutbox("m1")).toEqual({ ...EMPTY_OUTBOX, ratings: [RATING] });
  });

  it("guardar una bandeja vacía borra la entrada", async () => {
    await saveOutbox("m1", FULL);
    await saveOutbox("m1", EMPTY_OUTBOX);

    expect(await loadOutbox("m1")).toEqual(EMPTY_OUTBOX);
  });

  it("rechaza con error si IndexedDB no está disponible", async () => {
    // @ts-expect-error simula un navegador sin IndexedDB
    globalThis.indexedDB = undefined;

    await expect(saveOutbox("m1", FULL)).rejects.toThrow();
    await expect(loadOutbox("m1")).rejects.toThrow();
  });
});
