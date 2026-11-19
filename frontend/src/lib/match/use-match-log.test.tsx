import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LineupEventRecord } from "@/lib/api/match-types";
import type { LoggedEvent } from "@/lib/api/match-types";
import { mockApi, type MockHandler } from "@/test/mock-api";

import { effectiveEvents } from "./events";
import { useMatchLog } from "./use-match-log";

interface SyncBody {
  events: { id: string; seq: number; kind: string; voids_event_id: string | null }[];
  lineup_events: { id: string; seq: number }[];
  ratings: { id: string; stars: number }[];
}

const STARTED: LineupEventRecord = {
  id: "l1",
  seq: 1,
  payload: { type: "part_started", part: 1, starters: ["p1", "p2", "p3", "p4", "p5"] },
};
const GOAL: LoggedEvent = {
  id: "e1",
  seq: 4,
  kind: "goal",
  part: 1,
  t: 100,
  player_id: "p1",
  voids_event_id: null,
};

/** Un servidor que acepta todo lo que recibe. */
const acceptAll: MockHandler = (request) => {
  const body = request.body as SyncBody;
  const accepted = [...body.events, ...body.lineup_events, ...body.ratings].map((item) => item.id);
  return { data: { accepted, duplicates: [], rejected: [] } };
};

function setup(extra: { initialEvents?: LoggedEvent[] } = {}, sync: MockHandler = acceptAll) {
  const server = mockApi({ "POST /matches/m1/sync": sync });
  const hook = renderHook(() =>
    useMatchLog({
      matchId: "m1",
      initialLineup: [STARTED],
      initialEvents: extra.initialEvents ?? [],
    }),
  );
  return { server, ...hook };
}

const posts = (server: ReturnType<typeof mockApi>) => server.calls.filter((c) => c.method === "POST");

describe("useMatchLog", () => {
  it("anota el evento al instante y lo envía en segundo plano", async () => {
    const { result, server } = setup();

    act(() => {
      result.current.recordEvent({ kind: "goal", part: 1, t: 120, player_id: "p1" });
    });

    expect(result.current.events).toHaveLength(1);
    expect(result.current.pending).toBe(1);
    await waitFor(() => expect(result.current.pending).toBe(0));
    expect(result.current.status).toBe("synced");
    const sent = (posts(server)[0].body as SyncBody).events[0];
    expect(sent).toMatchObject({ kind: "goal", seq: 1 });
  });

  it("numera los eventos y la alineación por separado, a partir de lo ya guardado", async () => {
    const { result, server } = setup({ initialEvents: [GOAL] });

    act(() => {
      result.current.recordEvent({ kind: "foul", part: 1, t: 130, player_id: "p2" });
      result.current.recordLineup({ type: "substituted", t: 200, player_out: "p1", player_in: "p6" });
    });
    await waitFor(() => expect(result.current.pending).toBe(0));

    const body = posts(server)[0].body as SyncBody;
    expect(body.events[0].seq).toBe(5);
    expect(body.lineup_events[0].seq).toBe(2);
  });

  it("agrupa en un solo envío lo anotado en el mismo instante", async () => {
    const { result, server } = setup();

    act(() => {
      result.current.recordLineup({ type: "substituted", t: 60, player_out: "p1", player_in: "p6" });
      result.current.recordEvent({ kind: "goal", part: 1, t: 60, player_id: "p2" });
      result.current.recordRating(1, 60, 4);
    });
    await waitFor(() => expect(result.current.pending).toBe(0));

    expect(posts(server)).toHaveLength(1);
    const body = posts(server)[0].body as SyncBody;
    expect([body.lineup_events.length, body.events.length, body.ratings.length]).toEqual([1, 1, 1]);
    expect(body.ratings[0].stars).toBe(4);
  });

  it("si se corta la red lo conserva y lo reenvía con los mismos ids sin duplicar", async () => {
    const { result, server } = setup();
    const original = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    act(() => {
      result.current.recordEvent({ kind: "goal", part: 1, t: 120, player_id: "p1" });
    });
    await waitFor(() => expect(result.current.status).toBe("offline"));
    expect(result.current.pending).toBe(1);
    const stored = result.current.events[0];

    vi.stubGlobal("fetch", original);
    await act(async () => {
      await result.current.flush();
    });

    expect(result.current.pending).toBe(0);
    expect(result.current.status).toBe("synced");
    expect(result.current.events).toEqual([stored]);
    expect((posts(server)[0].body as SyncBody).events[0].id).toBe(stored.id);
  });

  it("reintenta solo cuando vuelve la red", async () => {
    const { result } = setup();
    const original = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    act(() => {
      result.current.recordEvent({ kind: "shot", part: 1, t: 50, player_id: "p3" });
    });
    await waitFor(() => expect(result.current.status).toBe("offline"));

    vi.stubGlobal("fetch", original);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(result.current.pending).toBe(0));
  });

  it("no envía dos veces a la vez aunque se pida varias veces", async () => {
    const { result, server } = setup();
    act(() => {
      result.current.recordEvent({ kind: "goal", part: 1, t: 10, player_id: "p1" });
    });

    await act(async () => {
      await Promise.all([result.current.flush(), result.current.flush(), result.current.flush()]);
    });

    expect(posts(server)).toHaveLength(1);
  });

  it("un rechazo del servidor marca conflicto y no se reenvía", async () => {
    const { result, server } = setup({}, (request) => ({
      data: {
        accepted: [],
        duplicates: [],
        rejected: [{ id: (request.body as SyncBody).events[0].id, reason: "seq_conflict" }],
      },
    }));

    act(() => {
      result.current.recordEvent({ kind: "goal", part: 1, t: 10, player_id: "p1" });
    });

    await waitFor(() => expect(result.current.status).toBe("conflict"));
    expect(result.current.pending).toBe(0);
    await act(async () => {
      await result.current.flush();
    });
    expect(posts(server)).toHaveLength(1);
  });

  it("deshacer un evento ya enviado anota un evento compensatorio", async () => {
    const { result, server } = setup({ initialEvents: [GOAL] });

    act(() => {
      result.current.undoLast();
    });
    await waitFor(() => expect(result.current.pending).toBe(0));

    const undo = (posts(server)[0].body as SyncBody).events[0];
    expect(undo).toMatchObject({ kind: "undo", voids_event_id: "e1", seq: 5 });
    expect(effectiveEvents(result.current.events)).toEqual([]);
  });

  it("deshacer un evento que ni siquiera salió lo quita sin dejar rastro", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { result, server } = setup();
    const original = globalThis.fetch;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      gate.then(() => original(input, init)),
    );
    act(() => {
      result.current.recordEvent({ kind: "goal", part: 1, t: 10, player_id: "p1" });
    });
    await act(async () => Promise.resolve());
    act(() => {
      result.current.recordEvent({ kind: "foul", part: 1, t: 20, player_id: "p2" });
    });

    act(() => {
      result.current.undoLast();
    });
    release();
    await waitFor(() => expect(result.current.pending).toBe(0));

    const sent = posts(server).flatMap((call) => (call.body as SyncBody).events.map((e) => e.kind));
    expect(sent).toEqual(["goal"]);
    expect(result.current.events.map((e) => e.kind)).toEqual(["goal"]);
  });

  it("deshacer un evento cuyo envío falló lo compensa, porque pudo llegar al servidor", async () => {
    const { result, server } = setup();
    const original = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    act(() => {
      result.current.recordEvent({ kind: "goal", part: 1, t: 10, player_id: "p1" });
    });
    await waitFor(() => expect(result.current.status).toBe("offline"));
    const goalId = result.current.events[0].id;

    act(() => {
      result.current.undoLast();
    });
    expect(result.current.events.map((e) => e.kind)).toEqual(["goal", "undo"]);
    vi.stubGlobal("fetch", original);
    await act(async () => {
      await result.current.flush();
    });

    const sent = (posts(server)[0].body as SyncBody).events;
    expect(sent.map((e) => [e.kind, e.seq])).toEqual([
      ["goal", 1],
      ["undo", 2],
    ]);
    expect(sent[1].voids_event_id).toBe(goalId);
  });

  it("un 500 del servidor se reintenta como un corte de red", async () => {
    let fail = true;
    const { result } = setup({}, (request) =>
      fail ? { status: 500, error: { code: "internal_error", message: "Fallo" } } : acceptAll(request),
    );

    act(() => {
      result.current.recordEvent({ kind: "goal", part: 1, t: 10, player_id: "p1" });
    });
    await waitFor(() => expect(result.current.status).toBe("offline"));
    fail = false;
    await act(async () => {
      await result.current.flush();
    });

    expect(result.current.status).toBe("synced");
  });

  it("la revisión sube con cada anotación", () => {
    const { result } = setup();
    const before = result.current.revision;

    act(() => {
      result.current.recordEvent({ kind: "goal", part: 1, t: 10, player_id: "p1" });
    });

    expect(result.current.revision).toBeGreaterThan(before);
  });

  it("deshacer sin nada que deshacer no hace nada", () => {
    const { result, server } = setup();

    act(() => {
      result.current.undoLast();
    });

    expect(result.current.events).toEqual([]);
    expect(posts(server)).toHaveLength(0);
  });

  it("deshacer dos veces seguidas deshace los dos últimos eventos", async () => {
    const { result } = setup({ initialEvents: [GOAL] });
    act(() => {
      result.current.recordEvent({ kind: "foul", part: 1, t: 200, player_id: "p2" });
    });
    await waitFor(() => expect(result.current.pending).toBe(0));

    act(() => {
      result.current.undoLast();
    });
    await waitFor(() => expect(result.current.pending).toBe(0));
    act(() => {
      result.current.undoLast();
    });
    await waitFor(() => expect(result.current.pending).toBe(0));

    expect(effectiveEvents(result.current.events)).toEqual([]);
  });
});
