import { IDBFactory } from "fake-indexeddb";
import { openDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";

import type { EventIn, LineupEventRecord, LoggedEvent, Match, StintRecord } from "@/lib/api/match-types";
import type { Player } from "@/lib/api/types";

import { clearSnapshots, loadSnapshot, saveSnapshot, type MatchSnapshot } from "./match-cache";
import { EMPTY_OUTBOX, type Outbox } from "./outbox";
import { loadOutbox, saveOutbox } from "./outbox-store";

const MATCH: Match = { id: "m1", session_id: "s1", held_on: "2026-10-24", opponent: "Rival" };
const STARTED: LineupEventRecord = {
  id: "l1",
  seq: 1,
  payload: { type: "part_started", part: 1, starters: ["p1", "p2", "p3", "p4", "p5"] },
};
const GOAL: LoggedEvent = {
  id: "e1",
  seq: 1,
  kind: "goal",
  part: 1,
  t: 100,
  player_id: "p1",
  voids_event_id: null,
};
const STINT: StintRecord = { id: "t1", match_id: "m1", player_id: "p1", part: 1, start_s: 0, end_s: 600 };
const PLAYER: Player = {
  id: "p1",
  name: "Ana",
  dorsal: 7,
  position: "field",
  status: "available",
  is_active: true,
};
const DATA: Omit<MatchSnapshot, "savedAt"> = {
  match: MATCH,
  lineup: [STARTED],
  events: [GOAL],
  stints: [STINT],
  players: [PLAYER],
  proposed: ["p1"],
};
const SAVED_AT = 1_761_000_000_000;
const UNSENT_GOAL: EventIn = { id: "e9", seq: 9, kind: "goal", part: 1, t: 5, player_id: "p1" };
const PENDING: Outbox = { ...EMPTY_OUTBOX, events: [UNSENT_GOAL] };

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("match-cache", () => {
  it("devuelve null si no hay nada guardado", async () => {
    expect(await loadSnapshot("m1")).toBeNull();
  });

  it("recupera lo guardado junto con la hora en que se guardó", async () => {
    await saveSnapshot("m1", DATA, SAVED_AT);

    expect(await loadSnapshot("m1")).toEqual({ ...DATA, savedAt: SAVED_AT });
  });

  it("usa la hora actual si no se indica otra", async () => {
    const before = Date.now();
    await saveSnapshot("m1", DATA);

    const stored = await loadSnapshot("m1");
    expect(stored?.savedAt).toBeGreaterThanOrEqual(before);
    expect(stored?.savedAt).toBeLessThanOrEqual(Date.now());
  });

  it("guarda cada partido por separado", async () => {
    await saveSnapshot("m1", DATA, SAVED_AT);
    await saveSnapshot("m2", { ...DATA, match: { ...MATCH, id: "m2" } }, SAVED_AT);

    expect((await loadSnapshot("m1"))?.match.id).toBe("m1");
    expect((await loadSnapshot("m2"))?.match.id).toBe("m2");
  });

  it("guardar de nuevo sustituye a la copia anterior", async () => {
    await saveSnapshot("m1", DATA, SAVED_AT);
    await saveSnapshot("m1", { ...DATA, events: [] }, SAVED_AT + 1);

    expect(await loadSnapshot("m1")).toEqual({ ...DATA, events: [], savedAt: SAVED_AT + 1 });
  });

  it("clearSnapshots borra todas las copias", async () => {
    await saveSnapshot("m1", DATA, SAVED_AT);
    await saveSnapshot("m2", DATA, SAVED_AT);

    await clearSnapshots();

    expect(await loadSnapshot("m1")).toBeNull();
    expect(await loadSnapshot("m2")).toBeNull();
  });

  it("clearSnapshots no toca la bandeja de lo anotado sin enviar", async () => {
    await saveOutbox("m1", PENDING);
    await saveSnapshot("m1", DATA, SAVED_AT);

    await clearSnapshots();

    expect(await loadOutbox("m1")).toEqual(PENDING);
  });

  it("rechaza con error si IndexedDB no está disponible", async () => {
    // @ts-expect-error simula un navegador sin IndexedDB
    globalThis.indexedDB = undefined;

    await expect(saveSnapshot("m1", DATA)).rejects.toThrow();
    await expect(loadSnapshot("m1")).rejects.toThrow();
    await expect(clearSnapshots()).rejects.toThrow();
  });

  it("al migrar desde la versión 1 conserva la bandeja ya guardada", async () => {
    const legacy = await openDB("futsal-stats", 1, {
      upgrade(db) {
        db.createObjectStore("outbox");
      },
    });
    await legacy.put("outbox", PENDING, "m1");
    legacy.close();

    await saveSnapshot("m1", DATA, SAVED_AT);

    expect(await loadOutbox("m1")).toEqual(PENDING);
    expect(await loadSnapshot("m1")).toEqual({ ...DATA, savedAt: SAVED_AT });
  });
});
