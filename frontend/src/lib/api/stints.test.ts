import { describe, expect, it } from "vitest";

import { queryCache } from "@/lib/query-cache";
import { matchStatsQuery } from "@/lib/queries";
import { mockApi } from "@/test/mock-api";

import { createStint, deleteStint, updateStint } from "./stints";

describe("API de tramos", () => {
  it("createStint envía el tramo al partido", async () => {
    const api = mockApi({ "POST /matches/m1/stints": { data: { id: "t1" } } });

    await createStint("m1", { player_id: "p1", part: 1, start_s: 0, end_s: 300 });

    expect(api.calls[0].body).toEqual({ player_id: "p1", part: 1, start_s: 0, end_s: 300 });
  });

  it("updateStint envía solo lo que cambia con PATCH", async () => {
    const api = mockApi({ "PATCH /stints/t1": { data: { id: "t1" } } });

    await updateStint("t1", { end_s: 360 });

    expect(api.calls[0].method).toBe("PATCH");
    expect(api.calls[0].body).toEqual({ end_s: 360 });
  });

  it("deleteStint borra el tramo", async () => {
    const api = mockApi({ "DELETE /stints/t1": { data: { id: "t1" } } });

    await deleteStint("t1");

    expect(api.count("DELETE", "/stints/t1")).toBe(1);
  });

  it("codifica los ids en la ruta", async () => {
    const api = mockApi({ "DELETE /stints/a%2Fb": { data: {} } });

    await deleteStint("a/b");

    expect(api.calls[0].path).toBe("/stints/a%2Fb");
  });

  describe("olvida las estadísticas cacheadas del partido del tramo", () => {
    const key = matchStatsQuery("m1").key;
    const record = { id: "t1", match_id: "m1", player_id: "p1", part: 1, start_s: 0, end_s: 300 };

    it("al crear un tramo", async () => {
      mockApi({ "POST /matches/m1/stints": { data: record } });
      queryCache.set(key, "viejo");

      await createStint("m1", { player_id: "p1", part: 1, start_s: 0, end_s: 300 });

      expect(queryCache.get(key)).toBeUndefined();
    });

    it("al editar un tramo", async () => {
      mockApi({ "PATCH /stints/t1": { data: record } });
      queryCache.set(key, "viejo");

      await updateStint("t1", { end_s: 360 });

      expect(queryCache.get(key)).toBeUndefined();
    });

    it("al borrar un tramo", async () => {
      mockApi({ "DELETE /stints/t1": { data: record } });
      queryCache.set(key, "viejo");

      await deleteStint("t1");

      expect(queryCache.get(key)).toBeUndefined();
    });
  });
});
