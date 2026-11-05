import { describe, expect, it } from "vitest";

import { queryCache } from "@/lib/query-cache";
import { matchStatsQuery } from "@/lib/queries";
import { mockApi } from "@/test/mock-api";

import {
  createMatch,
  finalizeMatch,
  listLineupEvents,
  listMatchEvents,
  listMatches,
  syncMatch,
} from "./matches";

describe("API de partidos", () => {
  it("listMatches y createMatch usan /matches", async () => {
    const api = mockApi({
      "GET /matches": { data: [] },
      "POST /matches": { data: { id: "m1" } },
    });

    await listMatches();
    await createMatch({ held_on: "2026-10-21", opponent: "Rival FS" });

    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /matches", "POST /matches"]);
    expect(api.calls[1].body).toEqual({ held_on: "2026-10-21", opponent: "Rival FS" });
  });

  it("createMatch envía la clave de idempotencia", async () => {
    const api = mockApi({ "POST /matches": { data: { id: "m1" } } });

    await createMatch({ held_on: "2026-10-21", opponent: "Rival FS" }, "k-match");

    expect(api.calls[0].headers.get("Idempotency-Key")).toBe("k-match");
  });

  it("lee los eventos y la alineación de un partido", async () => {
    const api = mockApi({
      "GET /matches/m1/events": { data: [] },
      "GET /matches/m1/lineup-events": { data: [] },
    });

    await listMatchEvents("m1");
    await listLineupEvents("m1");

    expect(api.count("GET", "/matches/m1/events")).toBe(1);
    expect(api.count("GET", "/matches/m1/lineup-events")).toBe(1);
  });

  it("syncMatch envía el lote y devuelve aceptados, duplicados y rechazados", async () => {
    const api = mockApi({
      "POST /matches/m1/sync": {
        data: { accepted: ["a"], duplicates: ["b"], rejected: [{ id: "c", reason: "unknown_player" }] },
      },
    });
    const batch = {
      lineup_events: [
        { id: "a", seq: 1, payload: { type: "part_started" as const, part: 1, starters: ["p1"] } },
      ],
    };

    const result = await syncMatch("m1", batch);

    expect(api.calls[0].body).toEqual(batch);
    expect(result).toEqual({
      accepted: ["a"],
      duplicates: ["b"],
      rejected: [{ id: "c", reason: "unknown_player" }],
    });
  });

  it("codifica el id del partido en la ruta", async () => {
    const api = mockApi({ "GET /matches/a%2Fb/lineup-events": { data: [] } });

    await listLineupEvents("a/b");

    expect(api.calls[0].path).toBe("/matches/a%2Fb/lineup-events");
  });

  it("finalizeMatch pide force solo cuando se rehace el cierre", async () => {
    const api = mockApi({
      "POST /matches/m1/finalize": { data: { stints: [], seconds_by_player: {} } },
    });

    await finalizeMatch("m1");
    await finalizeMatch("m1", true);

    expect(api.calls.map((c) => c.path)).toEqual([
      "/matches/m1/finalize",
      "/matches/m1/finalize?force=true",
    ]);
  });

  describe("olvida las estadísticas cacheadas del partido que cambia", () => {
    const key = matchStatsQuery("m1").key;

    it("al sincronizar eventos o alineación (también desde la cola offline)", async () => {
      mockApi({ "POST /matches/m1/sync": { data: { accepted: [], duplicates: [], rejected: [] } } });
      queryCache.set(key, "viejo");
      queryCache.set(matchStatsQuery("m2").key, "otro");

      await syncMatch("m1", { events: [] });

      expect(queryCache.get(key)).toBeUndefined();
      expect(queryCache.get(matchStatsQuery("m2").key)).toBe("otro");
    });

    it("aunque la sincronización falle, por si el servidor llegó a aplicarla", async () => {
      mockApi({ "POST /matches/m1/sync": { status: 500, error: { code: "internal_error", message: "x" } } });
      queryCache.set(key, "viejo");

      await expect(syncMatch("m1", { events: [] })).rejects.toThrow();

      expect(queryCache.get(key)).toBeUndefined();
    });

    it("al cerrar el partido", async () => {
      mockApi({ "POST /matches/m1/finalize": { data: { stints: [], seconds_by_player: {} } } });
      queryCache.set(key, "viejo");

      await finalizeMatch("m1", true);

      expect(queryCache.get(key)).toBeUndefined();
    });
  });
});
