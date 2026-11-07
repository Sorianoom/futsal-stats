import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { CacheWarmer } from "@/components/cache-warmer";
import { queryCache } from "@/lib/query-cache";
import { currentWeekStart } from "@/lib/weeks";
import { mockApi } from "@/test/mock-api";
import { fakeUser, renderWithAuth } from "@/test/render-with-auth";

const WEEK = currentWeekStart();

const ROUTES = {
  "GET /players": { data: [{ id: "p1" }] },
  "GET /matches": { data: [{ id: "m1" }] },
  "GET /stats/players": { data: { players: [] } },
  "GET /catalog/infractions": { data: [{ code: "a" }] },
  "GET /callup": { data: { week: WEEK } },
  "GET /sessions": { data: [] },
  "GET /movements": { data: [] },
};

beforeEach(() => {
  queryCache.clear();
});

describe("CacheWarmer", () => {
  it("el entrenador precarga todas las pestañas", async () => {
    mockApi(ROUTES);

    renderWithAuth(<CacheWarmer />);

    await waitFor(() => expect(queryCache.get("puntos:reference")).toBeDefined());
    for (const key of [
      "/players",
      "/matches",
      "stats:season",
      `callup:${WEEK}`,
      `sessions:${WEEK}`,
      `movements:${WEEK}`,
    ]) {
      await waitFor(() => expect(queryCache.get(key)).toBeDefined());
    }
  });

  it("el ayudante no pide lo que solo ve el entrenador", async () => {
    const api = mockApi(ROUTES);

    renderWithAuth(<CacheWarmer />, { user: fakeUser("assistant_coach") });

    await waitFor(() => expect(queryCache.get("stats:season")).toBeDefined());
    expect(queryCache.get("/players")).toBeDefined();
    expect(api.count("GET", "/callup")).toBe(0);
    expect(api.count("GET", "/movements")).toBe(0);
  });

  it("el jugador solo precarga partidos y estadísticas, que es lo que puede leer", async () => {
    const api = mockApi(ROUTES);

    renderWithAuth(<CacheWarmer />, { user: fakeUser("player") });

    await waitFor(() => expect(queryCache.get("stats:season")).toBeDefined());
    await waitFor(() => expect(queryCache.get("/matches")).toBeDefined());
    expect(api.count("GET", "/players")).toBe(0);
    expect(api.calls.map((call) => call.path.split("?")[0]).sort()).toEqual([
      "/matches",
      "/stats/players",
    ]);
  });

  it("no pide nada si no hay sesión", () => {
    const api = mockApi(ROUTES);

    renderWithAuth(<CacheWarmer />, { user: null, status: "anonymous" });

    expect(api.calls).toHaveLength(0);
  });

  it("un fallo no rompe nada ni deja basura en la caché", async () => {
    const api = mockApi({});

    renderWithAuth(<CacheWarmer />);

    await waitFor(() => expect(api.calls.length).toBeGreaterThan(0));
    expect(queryCache.get("/players")).toBeUndefined();
  });

  it("no rellena la caché con respuestas que llegan tras cerrar la sesión", async () => {
    const api = mockApi(ROUTES);

    renderWithAuth(<CacheWarmer />);
    queryCache.clear(); // cierre de sesión con las peticiones aún en vuelo
    await waitFor(() => expect(api.calls.length).toBeGreaterThanOrEqual(4));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(queryCache.get("/players")).toBeUndefined();
  });

  it("invalidar otra clave con las peticiones en vuelo no impide guardarlas", async () => {
    mockApi(ROUTES);

    renderWithAuth(<CacheWarmer />);
    queryCache.invalidate("stats:match:m1"); // la cola offline sincroniza un partido

    await waitFor(() => expect(queryCache.get("/players")).toBeDefined());
    await waitFor(() => expect(queryCache.get("stats:season")).toBeDefined());
  });

  it("pide cada lectura una sola vez", async () => {
    const api = mockApi(ROUTES);

    renderWithAuth(<CacheWarmer />);
    await waitFor(() => expect(queryCache.get("puntos:reference")).toBeDefined());
    await waitFor(() => expect(queryCache.get(`movements:${WEEK}`)).toBeDefined());

    // plantilla, partidos, temporada, plantilla completa y catálogo (puntos), convocatoria,
    // entrenos y movimientos
    expect(api.calls).toHaveLength(8);
  });
});
