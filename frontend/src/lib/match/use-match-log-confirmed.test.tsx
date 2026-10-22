import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LineupEventRecord, LoggedEvent } from "@/lib/api/match-types";
import { mockApi, type MockHandler } from "@/test/mock-api";

import type { ConfirmedLog } from "./outbox";
import { useMatchLog } from "./use-match-log";

interface SyncBody {
  events: { id: string }[];
  lineup_events: { id: string }[];
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

const acceptAll: MockHandler = (request) => {
  const body = request.body as SyncBody;
  const accepted = [...body.events, ...body.lineup_events, ...body.ratings].map((item) => item.id);
  return { data: { accepted, duplicates: [], rejected: [] } };
};

function setup(onConfirmed: (log: ConfirmedLog) => Promise<void> | void, sync: MockHandler = acceptAll) {
  mockApi({ "POST /matches/m1/sync": sync });
  return renderHook(() =>
    useMatchLog({ matchId: "m1", initialLineup: [STARTED], initialEvents: [GOAL], onConfirmed }),
  );
}

describe("useMatchLog: onConfirmed", () => {
  it("avisa con la vista confirmada cuando el servidor acepta lo enviado", async () => {
    const onConfirmed = vi.fn();
    const { result } = setup(onConfirmed);

    act(() => {
      result.current.recordEvent({ kind: "foul", part: 1, t: 130, player_id: "p2" });
    });

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    const confirmed = onConfirmed.mock.calls[0][0] as ConfirmedLog;
    expect(confirmed.lineup).toEqual([STARTED]);
    expect(confirmed.events.map((event) => event.kind)).toEqual(["goal", "foul"]);
  });

  it("no avisa mientras lo anotado sigue sin llegar al servidor", async () => {
    const onConfirmed = vi.fn();
    const failing: MockHandler = () => ({ status: 503, error: { code: "server_error", message: "down" } });
    const { result } = setup(onConfirmed, failing);

    act(() => {
      result.current.recordEvent({ kind: "foul", part: 1, t: 130, player_id: "p2" });
    });
    await waitFor(() => expect(result.current.status).toBe("offline"));

    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("no avisa si el servidor rechaza algo: la vista confirmada no es fiable", async () => {
    const onConfirmed = vi.fn();
    const rejecting: MockHandler = (request) => ({
      data: {
        accepted: [],
        duplicates: [],
        rejected: [{ id: (request.body as SyncBody).events[0].id, reason: "seq_conflict" }],
      },
    });
    const { result } = setup(onConfirmed, rejecting);

    act(() => {
      result.current.recordEvent({ kind: "foul", part: 1, t: 130, player_id: "p2" });
    });
    await waitFor(() => expect(result.current.status).toBe("conflict"));

    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("un fallo al guardar la copia no rompe el envío", async () => {
    const onConfirmed = vi.fn().mockRejectedValue(new Error("quota"));
    const { result } = setup(onConfirmed);

    act(() => {
      result.current.recordEvent({ kind: "foul", part: 1, t: 130, player_id: "p2" });
    });

    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
    await waitFor(() => expect(result.current.pending).toBe(0));
    expect(result.current.status).toBe("synced");
  });

  it("guarda las copias en orden aunque la anterior tarde más", async () => {
    const order: number[] = [];
    const onConfirmed = vi.fn(async (log: ConfirmedLog) => {
      const size = log.events.length;
      await new Promise((resolve) => setTimeout(resolve, size === 2 ? 30 : 0));
      order.push(size);
    });
    const { result } = setup(onConfirmed);

    act(() => {
      result.current.recordEvent({ kind: "foul", part: 1, t: 130, player_id: "p2" });
    });
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    act(() => {
      result.current.recordEvent({ kind: "foul", part: 1, t: 140, player_id: "p3" });
    });

    await waitFor(() => expect(order).toEqual([2, 3]));
  });
});
