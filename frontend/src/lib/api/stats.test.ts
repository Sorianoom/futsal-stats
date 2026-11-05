import { describe, expect, it } from "vitest";

import { queryCache } from "@/lib/query-cache";
import { matchStatsQuery, playersQuery, seasonStatsQuery } from "@/lib/queries";

import { invalidateMatchStats } from "./stats";

describe("invalidateMatchStats", () => {
  it("olvida el detalle del partido y el acumulado de temporada, que también lo incluye", () => {
    queryCache.set(matchStatsQuery("m1").key, "detalle viejo");
    queryCache.set(seasonStatsQuery.key, "temporada vieja");

    invalidateMatchStats("m1");

    expect(queryCache.get(matchStatsQuery("m1").key)).toBeUndefined();
    expect(queryCache.get(seasonStatsQuery.key)).toBeUndefined();
  });

  it("no toca otros partidos ni otras pestañas", () => {
    queryCache.set(matchStatsQuery("m2").key, "otro partido");
    queryCache.set(playersQuery.key, "jugadores");

    invalidateMatchStats("m1");

    expect(queryCache.get(matchStatsQuery("m2").key)).toBe("otro partido");
    expect(queryCache.get(playersQuery.key)).toBe("jugadores");
  });
});
