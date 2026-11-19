import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LineupEventRecord } from "@/lib/api/match-types";
import { mockApi, type MockHandler } from "@/test/mock-api";

import { STALLED_RETRY_MS, useMatchLog } from "./use-match-log";

interface SyncBody {
  events: { id: string; kind: string; player_id: string | null; voids_event_id: string | null }[];
  lineup_events: { id: string }[];
  ratings: { id: string }[];
}

const STARTED: LineupEventRecord = {
  id: "l1",
  seq: 1,
  payload: { type: "part_started", part: 1, starters: ["p1", "p2", "p3", "p4", "p5"] },
};

const idsOf = (body: SyncBody) => [...body.events, ...body.lineup_events, ...body.ratings].map((i) => i.id);

/** Acepta todo salvo los eventos del jugador "ghost", que rechaza como desconocido. */
const rejectGhost: MockHandler = (request) => {
  const body = request.body as SyncBody;
  const ghost = new Set(body.events.filter((e) => e.player_id === "ghost").map((e) => e.id));
  const voidsGhost = body.events.filter((e) => e.voids_event_id && ghost.has(e.voids_event_id)).map((e) => e.id);
  const rejected = [
    ...[...ghost].map((id) => ({ id, reason: "unknown_player" })),
    ...voidsGhost.map((id) => ({ id, reason: "void_target_missing" })),
  ];
  const out = new Set(rejected.map((r) => r.id));
  return { data: { accepted: idsOf(body).filter((id) => !out.has(id)), duplicates: [], rejected } };
};

function setup(sync: MockHandler, syncTimeoutMs?: number, stalledRetryMs?: number) {
  const server = mockApi({ "POST /matches/m1/sync": sync });
  const hook = renderHook(() =>
    useMatchLog({ matchId: "m1", initialLineup: [STARTED], initialEvents: [], syncTimeoutMs, stalledRetryMs }),
  );
  return { server, ...hook };
}

const posts = (server: ReturnType<typeof mockApi>) => server.calls.filter((c) => c.method === "POST");

describe("useMatchLog: un rechazo no bloquea la anotación", () => {
  it("quita lo rechazado, avisa de qué fue y deja seguir anotando", async () => {
    const { result, server } = setup(rejectGhost);

    act(() => {
      result.current.recordEvent({ kind: "goal", part: 1, t: 10, player_id: "ghost" });
      result.current.recordEvent({ kind: "foul", part: 1, t: 12, player_id: "p2" });
    });
    await waitFor(() => expect(result.current.rejections).toHaveLength(1));

    expect(result.current.status).toBe("synced");
    expect(result.current.rejections[0]).toMatchObject({ reason: "unknown_player", event: { kind: "goal" } });
    expect(result.current.events.map((e) => e.kind)).toEqual(["foul"]);
    act(() => {
      result.current.recordEvent({ kind: "shot", part: 1, t: 20, player_id: "p3" });
    });
    await waitFor(() => expect(result.current.pending).toBe(0));
    expect(posts(server)).toHaveLength(2);

    act(() => {
      result.current.dismissRejections();
    });
    expect(result.current.rejections).toEqual([]);
  });

  it("lo pendiente que deshacía algo rechazado también se descarta", async () => {
    const original = globalThis.fetch;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { result, server } = setup(rejectGhost);
    const mocked = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      gate.then(() => mocked(input, init))) as typeof fetch;
    act(() => {
      result.current.recordEvent({ kind: "goal", part: 1, t: 10, player_id: "ghost" });
    });
    await act(async () => Promise.resolve());
    // El gol ya salió (pudo llegar), así que deshacer deja un evento compensatorio pendiente.
    act(() => {
      result.current.undoLast();
    });
    release();
    await waitFor(() => expect(result.current.pending).toBe(0));
    globalThis.fetch = original;

    expect(result.current.events).toEqual([]);
    expect(posts(server)).toHaveLength(1);
  });

  it("si se rechaza un cambio, los cambios pendientes que dependían de él se quitan y se avisan", async () => {
    const original = globalThis.fetch;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    // Rechaza el cambio en que entra p6 como si p6 no existiera.
    const { result, server } = setup((request) => {
      const body = request.body as Omit<SyncBody, "lineup_events"> & {
        lineup_events: { id: string; payload: { player_in?: string } }[];
      };
      const bad = body.lineup_events.filter((l) => l.payload.player_in === "p6").map((l) => l.id);
      const accepted = idsOf(body).filter((id) => !bad.includes(id));
      return { data: { accepted, duplicates: [], rejected: bad.map((id) => ({ id, reason: "unknown_player" })) } };
    });
    const mocked = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      gate.then(() => mocked(input, init))) as typeof fetch;
    act(() => {
      result.current.recordLineup({ type: "substituted", t: 60, player_out: "p1", player_in: "p6" });
    });
    await act(async () => Promise.resolve());
    // Anotado mientras el primero va de camino: saca a p6, que solo está en pista si entró.
    act(() => {
      result.current.recordLineup({ type: "substituted", t: 90, player_out: "p6", player_in: "p7" });
      result.current.recordLineup({ type: "substituted", t: 120, player_out: "p2", player_in: "p8" });
    });
    release();
    await waitFor(() => expect(result.current.pending).toBe(0));
    globalThis.fetch = original;

    expect(result.current.lineup.map((l) => l.payload.type === "substituted" && l.payload.player_in)).toEqual([
      false,
      "p8",
    ]);
    expect(result.current.rejections.map((r) => r.reason)).toEqual(["unknown_player", "depends_on_rejected"]);
    expect(result.current.rejections[1].lineup?.payload).toMatchObject({ player_out: "p6", player_in: "p7" });
    const sent = posts(server).flatMap((c) => (c.body as SyncBody).lineup_events.map((l) => l.id));
    expect(sent).toHaveLength(2);
  });

  it("un choque de secuencia con otro dispositivo sigue pidiendo recargar", async () => {
    const { result } = setup((request) => ({
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
  });

  it("el 409 de envío simultáneo se reintenta", async () => {
    let fail = true;
    const { result } = setup((request) =>
      fail
        ? { status: 409, error: { code: "conflict", message: "Envío simultáneo; vuelve a intentarlo" } }
        : rejectGhost(request),
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
    expect(result.current.problem).toBeNull();
  });

  it("otro error del servidor avisa sin bloquear y se puede reintentar", async () => {
    let fail = true;
    const { result } = setup((request) =>
      fail ? { status: 422, error: { code: "validation_error", message: "Dato inválido" } } : rejectGhost(request),
    );

    act(() => {
      result.current.recordEvent({ kind: "goal", part: 1, t: 10, player_id: "p1" });
    });
    await waitFor(() => expect(result.current.status).toBe("stalled"));
    expect(result.current.problem).toMatch(/Dato inválido/);
    fail = false;
    act(() => {
      result.current.recordEvent({ kind: "foul", part: 1, t: 11, player_id: "p1" });
    });

    await waitFor(() => expect(result.current.status).toBe("synced"));
    expect(result.current.pending).toBe(0);
  });

  it("un envío que no responde se corta al pasar el límite de espera", async () => {
    const { result } = setup(rejectGhost, 50);
    const mocked = globalThis.fetch;
    const hanging = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    globalThis.fetch = hanging as unknown as typeof fetch;

    act(() => {
      result.current.recordEvent({ kind: "goal", part: 1, t: 10, player_id: "p1" });
    });

    await waitFor(() => expect(result.current.status).toBe("offline"));
    expect(hanging).toHaveBeenCalledTimes(1);
    globalThis.fetch = mocked;
    await act(async () => {
      await result.current.flush();
    });
    expect(result.current.status).toBe("synced");
  });

  it("una respuesta que no es de la API (portal cautivo, cuerpo cortado) se reintenta como un corte de red", async () => {
    const { result } = setup(rejectGhost);
    const mocked = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response("<html>Portal del wifi</html>", { status: 200 })) as unknown as typeof fetch;

    act(() => {
      result.current.recordEvent({ kind: "goal", part: 1, t: 10, player_id: "p1" });
    });

    await waitFor(() => expect(result.current.status).toBe("offline"));
    globalThis.fetch = mocked;
    await act(async () => {
      await result.current.flush();
    });
    expect(result.current.status).toBe("synced");
  });

  it("un 429 (demasiadas peticiones) se reintenta como un corte de red", async () => {
    let fail = true;
    const { result } = setup((request) =>
      fail ? { status: 429, error: { code: "rate_limited", message: "Demasiadas peticiones" } } : rejectGhost(request),
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

  it("tras un rechazo del envío entero se reintenta solo, despacio, aunque no se anote nada más", async () => {
    let fail = true;
    const { result, server } = setup(
      (request) =>
        fail ? { status: 422, error: { code: "validation_error", message: "Dato inválido" } } : rejectGhost(request),
      undefined,
      100,
    );

    act(() => {
      result.current.recordEvent({ kind: "goal", part: 1, t: 10, player_id: "p1" });
    });
    await waitFor(() => expect(result.current.status).toBe("stalled"));
    await new Promise((resolve) => setTimeout(resolve, 350));
    // Sin bucle rápido: un reintento cada 100 ms como mucho (más el envío inicial).
    expect(posts(server).length).toBeGreaterThanOrEqual(2);
    expect(posts(server).length).toBeLessThanOrEqual(5);
    fail = false;

    await waitFor(() => expect(result.current.status).toBe("synced"));
    expect(result.current.pending).toBe(0);
  });

  it("por defecto el reintento tras un rechazo del envío entero es lento", () => {
    expect(STALLED_RETRY_MS).toBeGreaterThanOrEqual(30_000);
  });

  it("lo rechazado sin atender sigue avisándose tras recargar y se olvida al pulsar «Entendido»", async () => {
    const first = setup(rejectGhost);
    act(() => {
      first.result.current.recordEvent({ kind: "goal", part: 1, t: 10, player_id: "ghost" });
    });
    await waitFor(() => expect(first.result.current.rejections).toHaveLength(1));
    first.unmount();

    const reopened = renderHook(() => useMatchLog({ matchId: "m1", initialLineup: [STARTED], initialEvents: [] }));
    expect(reopened.result.current.rejections).toEqual([
      expect.objectContaining({ reason: "unknown_player", event: expect.objectContaining({ kind: "goal" }) }),
    ]);
    act(() => {
      reopened.result.current.dismissRejections();
    });
    reopened.unmount();

    const again = renderHook(() => useMatchLog({ matchId: "m1", initialLineup: [STARTED], initialEvents: [] }));
    expect(again.result.current.rejections).toEqual([]);
  });

  it("lo rechazado de un partido no se avisa en otro", async () => {
    const first = setup(rejectGhost);
    act(() => {
      first.result.current.recordEvent({ kind: "goal", part: 1, t: 10, player_id: "ghost" });
    });
    await waitFor(() => expect(first.result.current.rejections).toHaveLength(1));

    const other = renderHook(() => useMatchLog({ matchId: "m2", initialLineup: [STARTED], initialEvents: [] }));
    expect(other.result.current.rejections).toEqual([]);
  });
});
