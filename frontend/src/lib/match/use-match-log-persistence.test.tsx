import { IDBFactory } from "fake-indexeddb";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EventIn, LineupEventRecord, LoggedEvent } from "@/lib/api/match-types";
import { mockApi, type MockHandler } from "@/test/mock-api";

import { EMPTY_OUTBOX, type Outbox } from "./outbox";
import { loadOutbox } from "./outbox-store";
import { useMatchLog } from "./use-match-log";

interface SyncBody {
  events: { id: string; seq: number }[];
  lineup_events: { id: string; seq: number }[];
  ratings: { id: string }[];
}

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
const GOAL_IN: EventIn = { id: "e1", seq: 1, kind: "goal", part: 1, t: 100, player_id: "p1" };
const FOUL_IN: EventIn = { id: "e2", seq: 2, kind: "foul", part: 1, t: 130, player_id: "p2" };

const acceptAll: MockHandler = (request) => {
  const body = request.body as SyncBody;
  const accepted = [...body.events, ...body.lineup_events, ...body.ratings].map((item) => item.id);
  return { data: { accepted, duplicates: [], rejected: [] } };
};

function setup(extra: { savedOutbox?: Outbox; initialEvents?: LoggedEvent[]; storageFailed?: boolean } = {}) {
  const server = mockApi({ "POST /matches/m1/sync": acceptAll });
  const hook = renderHook(() =>
    useMatchLog({
      matchId: "m1",
      initialLineup: [STARTED],
      initialEvents: extra.initialEvents ?? [],
      savedOutbox: extra.savedOutbox,
      storageFailed: extra.storageFailed,
    }),
  );
  return { server, ...hook };
}

function cutNetwork(): () => void {
  const original = globalThis.fetch;
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
  return () => vi.stubGlobal("fetch", original);
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("useMatchLog: persistencia de la bandeja", () => {
  it("guarda en el dispositivo lo que no ha llegado al servidor", async () => {
    const { result } = setup();
    cutNetwork();

    act(() => {
      result.current.recordEvent({ kind: "goal", part: 1, t: 120, player_id: "p1" });
    });
    await waitFor(() => expect(result.current.status).toBe("offline"));

    await waitFor(async () => expect((await loadOutbox("m1")).events).toHaveLength(1));
    expect((await loadOutbox("m1")).events[0]).toMatchObject({ kind: "goal", t: 120 });
  });

  it("vacía lo guardado cuando el servidor lo confirma", async () => {
    const { result } = setup();

    act(() => {
      result.current.recordEvent({ kind: "goal", part: 1, t: 120, player_id: "p1" });
    });
    await waitFor(() => expect(result.current.pending).toBe(0));

    await waitFor(async () => expect(await loadOutbox("m1")).toEqual(EMPTY_OUTBOX));
  });

  it("no pierde anotaciones seguidas aunque cada guardado sea asíncrono", async () => {
    const { result } = setup();
    cutNetwork();

    act(() => {
      result.current.recordEvent({ kind: "goal", part: 1, t: 10, player_id: "p1" });
      result.current.recordEvent({ kind: "foul", part: 1, t: 20, player_id: "p2" });
      result.current.recordEvent({ kind: "shot", part: 1, t: 30, player_id: "p3" });
    });
    await waitFor(() => expect(result.current.status).toBe("offline"));

    await waitFor(async () => expect((await loadOutbox("m1")).events).toHaveLength(3));
  });

  it("al volver a abrir recupera lo guardado y lo envía con los mismos ids", async () => {
    const { result, server } = setup({ savedOutbox: { ...EMPTY_OUTBOX, events: [FOUL_IN] } });

    expect(result.current.events.map((event) => event.id)).toEqual(["e2"]);
    expect(result.current.pending).toBe(1);
    await waitFor(() => expect(result.current.pending).toBe(0));

    const sent = server.calls.filter((call) => call.method === "POST");
    expect((sent[0].body as SyncBody).events.map((event) => event.id)).toEqual(["e2"]);
    expect(result.current.status).toBe("synced");
  });

  it("sigue la numeración donde se dejó", async () => {
    const { result } = setup({
      initialEvents: [GOAL],
      savedOutbox: { ...EMPTY_OUTBOX, events: [FOUL_IN] },
    });
    cutNetwork();

    act(() => {
      result.current.recordEvent({ kind: "shot", part: 1, t: 200, player_id: "p3" });
    });

    expect(result.current.events.map((event) => event.seq)).toEqual([1, 2, 3]);
  });

  it("no reenvía lo guardado que el servidor ya tiene", async () => {
    const { result, server } = setup({
      initialEvents: [GOAL],
      savedOutbox: { ...EMPTY_OUTBOX, events: [GOAL_IN] },
    });

    expect(result.current.pending).toBe(0);
    expect(result.current.events).toHaveLength(1);
    await waitFor(async () => expect(await loadOutbox("m1")).toEqual(EMPTY_OUTBOX));
    expect(server.calls.filter((call) => call.method === "POST")).toHaveLength(0);
  });

  it("deshacer algo recuperado anota un evento compensatorio, porque pudo llegar al servidor", async () => {
    const { result } = setup({ savedOutbox: { ...EMPTY_OUTBOX, events: [FOUL_IN] } });
    cutNetwork();

    act(() => {
      result.current.undoLast();
    });

    expect(result.current.events.map((event) => event.kind)).toEqual(["foul", "undo"]);
    expect(result.current.events[1].voids_event_id).toBe("e2");
  });

  it("si no se puede guardar en el dispositivo, sigue funcionando y avisa", async () => {
    const { result } = setup();
    // @ts-expect-error simula un navegador sin IndexedDB (p. ej. navegación privada)
    globalThis.indexedDB = undefined;

    act(() => {
      result.current.recordEvent({ kind: "goal", part: 1, t: 120, player_id: "p1" });
    });

    await waitFor(() => expect(result.current.storageFailed).toBe(true));
    expect(result.current.events).toHaveLength(1);
    await waitFor(() => expect(result.current.pending).toBe(0));
  });

  it("avisa si ya falló la lectura al cargar", () => {
    const { result } = setup({ storageFailed: true });

    expect(result.current.storageFailed).toBe(true);
  });

  it("sin problemas de almacenamiento no avisa", () => {
    const { result } = setup();

    expect(result.current.storageFailed).toBe(false);
  });
});
