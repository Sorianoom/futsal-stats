import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LineupEventRecord, LoggedEvent } from "@/lib/api/match-types";
import { mockApi, type MockHandler } from "@/test/mock-api";

import { effectiveEvents } from "./events";
import { effectiveLineup, replayRecords } from "./lineup";
import { useMatchLog } from "./use-match-log";

interface SyncBody {
  events: { id: string; seq: number; kind: string; voids_event_id: string | null }[];
  lineup_events: { id: string; seq: number; payload: { type: string; voids_event_id?: string } }[];
  ratings: { id: string }[];
}

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
const END: LineupEventRecord = { id: "l3", seq: 3, payload: { type: "part_ended", t: 0 } };

const acceptAll: MockHandler = (request) => {
  const body = request.body as SyncBody;
  const accepted = [...body.events, ...body.lineup_events, ...body.ratings].map((item) => item.id);
  return { data: { accepted, duplicates: [], rejected: [] } };
};

function setup(initialLineup: LineupEventRecord[], initialEvents: LoggedEvent[] = []) {
  const server = mockApi({ "POST /matches/m1/sync": acceptAll });
  const hook = renderHook(() => useMatchLog({ matchId: "m1", initialLineup, initialEvents }));
  return { server, ...hook };
}

const posts = (server: ReturnType<typeof mockApi>) => server.calls.filter((c) => c.method === "POST");

describe("useMatchLog: deshacer movimientos de alineación", () => {
  it("deshacer un cambio ya guardado anota un deshacer de alineación", async () => {
    const { result, server } = setup([STARTED, SUB]);

    expect(result.current.undoable).toMatchObject({ kind: "lineup", record: SUB });
    act(() => {
      result.current.undoLast();
    });
    await waitFor(() => expect(result.current.pending).toBe(0));

    const sent = (posts(server)[0].body as SyncBody).lineup_events[0];
    expect(sent).toMatchObject({ seq: 3, payload: { type: "undo", voids_event_id: "l2" } });
    expect(effectiveLineup(result.current.lineup)).toEqual([STARTED]);
  });

  it("deshacer un fin de parte pulsado por error reabre la parte", async () => {
    const { result } = setup([STARTED, END]);

    act(() => {
      result.current.undoLast();
    });
    await waitFor(() => expect(result.current.pending).toBe(0));

    expect(replayRecords(result.current.lineup).currentPart).toBe(1);
  });

  it("un cambio que ni siquiera salió se quita sin dejar rastro", async () => {
    const { result, server } = setup([STARTED]);
    const original = globalThis.fetch;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const gated = (input: RequestInfo | URL, init?: RequestInit) => gate.then(() => original(input, init));
    globalThis.fetch = gated as typeof fetch;
    act(() => {
      result.current.recordEvent({ kind: "goal", part: 1, t: 10, player_id: "p1" });
    });
    await act(async () => Promise.resolve());
    act(() => {
      result.current.recordLineup({ type: "substituted", t: 60, player_out: "p1", player_in: "p6" });
    });

    act(() => {
      result.current.undoLast();
    });
    release();
    await waitFor(() => expect(result.current.pending).toBe(0));
    globalThis.fetch = original;

    expect(result.current.lineup).toEqual([STARTED]);
    expect(posts(server).flatMap((c) => (c.body as SyncBody).lineup_events)).toEqual([]);
  });

  it("deshace primero lo último anotado en la sesión aunque tenga el mismo tiempo", async () => {
    const { result } = setup([STARTED]);
    act(() => {
      result.current.recordEvent({ kind: "goal", part: 1, t: 300, player_id: "p2" });
      result.current.recordLineup({ type: "substituted", t: 300, player_out: "p1", player_in: "p6" });
    });
    await waitFor(() => expect(result.current.pending).toBe(0));

    expect(result.current.undoable).toMatchObject({ kind: "lineup" });
    act(() => {
      result.current.undoLast();
    });
    await waitFor(() => expect(result.current.pending).toBe(0));

    expect(result.current.undoable).toMatchObject({ kind: "event" });
  });

  it("la roja se deshace junto con su expulsión", async () => {
    const { result, server } = setup([STARTED]);
    act(() => {
      result.current.recordLineup({ type: "sent_off", t: 400, player_id: "p2" });
      result.current.recordEvent({ kind: "red", part: 1, t: 400, player_id: "p2" });
    });
    await waitFor(() => expect(result.current.pending).toBe(0));

    act(() => {
      result.current.undoLast();
    });
    await waitFor(() => expect(result.current.pending).toBe(0));

    const last = posts(server).at(-1)?.body as SyncBody;
    expect(last.events.map((e) => e.kind)).toEqual(["undo"]);
    expect(last.lineup_events.map((e) => e.payload.type)).toEqual(["undo"]);
    expect(effectiveEvents(result.current.events)).toEqual([]);
    expect(effectiveLineup(result.current.lineup)).toEqual([STARTED]);
  });

  it("deshacer el inicio de la primera parte deja el partido sin empezar", async () => {
    const { result } = setup([STARTED]);

    act(() => {
      result.current.undoLast();
    });
    await waitFor(() => expect(result.current.pending).toBe(0));

    expect(effectiveLineup(result.current.lineup)).toEqual([]);
    expect(result.current.undoable).toBeNull();
  });

  it("con el id de lo que se mostró, no deshace otra cosa si lo último cambió entretanto", async () => {
    const { result, server } = setup([STARTED, SUB]);
    const shown = result.current.undoable;
    expect(shown).toMatchObject({ kind: "lineup", record: SUB });

    act(() => {
      result.current.recordEvent({ kind: "goal", part: 1, t: 400, player_id: "p2" });
    });
    await waitFor(() => expect(result.current.pending).toBe(0));
    let done = true;
    act(() => {
      done = result.current.undoLast("l2");
    });

    expect(done).toBe(false);
    expect(effectiveLineup(result.current.lineup)).toEqual([STARTED, SUB]);
    expect(effectiveEvents(result.current.events)).toHaveLength(1);
    expect(posts(server)).toHaveLength(1);
  });

  it("con el id de lo que se mostró y sin cambios, deshace eso", async () => {
    const { result } = setup([STARTED, SUB]);
    let done = false;
    act(() => {
      done = result.current.undoLast("l2");
    });

    expect(done).toBe(true);
    expect(effectiveLineup(result.current.lineup)).toEqual([STARTED]);
  });
});
