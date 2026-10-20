import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Match } from "@/lib/api/match-types";
import type { MatchStats, SeasonStats } from "@/lib/api/stats-types";
import { mockApi, type MockHandler } from "@/test/mock-api";
import { fakeUser, renderWithAuth } from "@/test/render-with-auth";

import EstadisticasPage from "./page";

const navigation = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const MATCH: Match = { id: "m1", session_id: "s1", held_on: "2026-10-20", opponent: "Rival FS" };
const OLDER: Match = { id: "m0", session_id: "s0", held_on: "2026-10-13", opponent: "Cádiz" };

const STATS: MatchStats = {
  match_id: "m1",
  closed: true,
  score: { goals_for: 2, goals_against: 1 },
  team_fouls: [
    { part: 1, fouls: 3 },
    { part: 2, fouls: 5 },
  ],
  players: [
    {
      player_id: "p1",
      name: "Ana Ruiz",
      dorsal: 9,
      seconds: 2400,
      goals: 2,
      assists: 1,
      shots: 6,
      turnovers: 3,
      steals: 4,
      fouls: 2,
      yellows: 1,
      reds: 0,
    },
    {
      player_id: "p2",
      name: "Bea Soto",
      dorsal: 7,
      seconds: 305,
      goals: 0,
      assists: 0,
      shots: 0,
      turnovers: 0,
      steals: 0,
      fouls: 0,
      yellows: 0,
      reds: 1,
    },
  ],
  quintets: [
    {
      player_ids: ["p1", "p2"],
      seconds: 900,
      goals_for: 2,
      goals_against: 1,
      rating_count: 2,
      rating_average: 4.5,
    },
    {
      player_ids: ["p1"],
      seconds: 120,
      goals_for: 0,
      goals_against: 0,
      rating_count: 0,
      rating_average: null,
    },
  ],
  warnings: [],
};

const SEASON: SeasonStats = {
  matches: 2,
  warnings: [],
  players: [
    {
      player_id: "p1",
      name: "Ana Ruiz",
      dorsal: 9,
      matches_played: 2,
      seconds: 4800,
      goals: 4,
      assists: 2,
      shots: 12,
      turnovers: 6,
      steals: 8,
      fouls: 3,
      yellows: 1,
      reds: 0,
    },
    {
      player_id: "p2",
      name: "Bea Soto",
      dorsal: 7,
      matches_played: 1,
      seconds: 305,
      goals: 0,
      assists: 0,
      shots: 0,
      turnovers: 0,
      steals: 0,
      fouls: 0,
      yellows: 0,
      reds: 1,
    },
  ],
};

let matches: Match[];
let stats: MatchStats;
let season: SeasonStats;

beforeEach(() => {
  navigation.search = "id=m1";
  matches = [MATCH, OLDER];
  stats = STATS;
  season = SEASON;
});

function api(extra: Record<string, MockHandler> = {}) {
  return mockApi({
    "GET /matches": () => ({ data: matches }),
    "GET /matches/m1/stats": () => ({ data: stats }),
    "GET /stats/players": () => ({ data: season }),
    ...extra,
  });
}

describe("EstadisticasPage: lista de partidos", () => {
  beforeEach(() => {
    navigation.search = "";
  });

  it("lista los partidos con enlace a sus estadísticas", async () => {
    api();

    renderWithAuth(<EstadisticasPage />);

    const link = await screen.findByRole("link", { name: /Rival FS/ });
    expect(link).toHaveAttribute("href", "/estadisticas?id=m1");
    expect(link).toHaveTextContent("20 oct");
    expect(screen.getByRole("link", { name: /Cádiz/ })).toHaveAttribute("href", "/estadisticas?id=m0");
  });

  it("indica cuando no hay partidos", async () => {
    matches = [];
    api();

    renderWithAuth(<EstadisticasPage />);

    expect(await screen.findByText("Todavía no hay partidos")).toBeInTheDocument();
  });

  it("avisa si no se pueden cargar los partidos y permite reintentar", async () => {
    api({ "GET /matches": { status: 500, error: { code: "internal_error", message: "Fallo" } } });

    renderWithAuth(<EstadisticasPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar los partidos");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});

describe("EstadisticasPage: temporada", () => {
  beforeEach(() => {
    navigation.search = "";
  });

  it("acumula por jugador partidos jugados, minutos, minutos por partido y acciones", async () => {
    api();
    renderWithAuth(<EstadisticasPage />);

    const table = await screen.findByRole("table", { name: "Temporada" });
    const ana = within(table).getByText("9 · Ana Ruiz").closest("tr") as HTMLElement;

    expect(within(ana).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "9 · Ana Ruiz",
      "2",
      "80:00",
      "40:00",
      "4",
      "2",
      "12",
      "6",
      "8",
      "3",
      "1",
      "0",
    ]);
    const bea = within(table).getByText("7 · Bea Soto").closest("tr") as HTMLElement;
    expect(within(bea).getAllByRole("cell")[3]).toHaveTextContent("05:05");
  });

  it("dice de cuántos partidos cerrados sale el acumulado", async () => {
    api();

    renderWithAuth(<EstadisticasPage />);

    expect(await screen.findByText("Acumulado de 2 partidos cerrados")).toBeInTheDocument();
  });

  it("con un solo partido cerrado habla en singular", async () => {
    season = { ...SEASON, matches: 1 };
    api();

    renderWithAuth(<EstadisticasPage />);

    expect(await screen.findByText("Acumulado de 1 partido cerrado")).toBeInTheDocument();
  });

  it("sin partidos cerrados lo explica en vez de enseñar una tabla vacía", async () => {
    season = { matches: 0, players: [], warnings: [] };
    api();

    renderWithAuth(<EstadisticasPage />);

    expect(await screen.findByText(/Todavía no hay partidos cerrados/)).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Temporada" })).not.toBeInTheDocument();
  });

  it("si falla el acumulado avisa y reintenta sin esconder la lista de partidos", async () => {
    let fail = true;
    api({
      "GET /stats/players": () =>
        fail
          ? { status: 500, error: { code: "internal_error", message: "Fallo" } }
          : { data: season },
    });
    renderWithAuth(<EstadisticasPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No se pudo cargar el acumulado");
    expect(await screen.findByRole("link", { name: /Rival FS/ })).toBeInTheDocument();
    fail = false;
    await userEvent.click(within(alert).getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByRole("table", { name: "Temporada" })).toBeInTheDocument();
  });

  it("muestra los avisos del acumulado", async () => {
    season = { ...SEASON, warnings: ["1 partido(s) con eventos incoherentes no cuentan en el acumulado"] };
    api();

    renderWithAuth(<EstadisticasPage />);

    expect(await screen.findByText(/eventos incoherentes/)).toBeInTheDocument();
  });
});

describe("EstadisticasPage: estadísticas de un partido", () => {
  it("muestra el rival, el marcador y las faltas de equipo por parte", async () => {
    api();

    renderWithAuth(<EstadisticasPage />);

    expect(await screen.findByRole("heading", { name: /Rival FS/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Marcador")).toHaveTextContent("2 – 1");
    expect(screen.getByText("Faltas de equipo: 3 en la 1ª parte, 5 en la 2ª parte")).toBeInTheDocument();
  });

  it("tabla de jugadores con minutos en mm:ss y todas las acciones", async () => {
    api();
    renderWithAuth(<EstadisticasPage />);

    const table = await screen.findByRole("table", { name: "Jugadores" });
    const ana = within(table).getByText("9 · Ana Ruiz").closest("tr") as HTMLElement;
    const cells = within(ana).getAllByRole("cell").map((cell) => cell.textContent);

    expect(cells).toEqual(["9 · Ana Ruiz", "40:00", "2", "1", "6", "3", "4", "2", "1", "0"]);
    const bea = within(table).getByText("7 · Bea Soto").closest("tr") as HTMLElement;
    expect(within(bea).getAllByRole("cell")[1]).toHaveTextContent("05:05");
    expect(within(bea).getAllByRole("cell")[9]).toHaveTextContent("1");
  });

  it("las columnas tienen cabeceras comprensibles", async () => {
    api();
    renderWithAuth(<EstadisticasPage />);

    const table = await screen.findByRole("table", { name: "Jugadores" });

    const headers = within(table)
      .getAllByRole("columnheader")
      .map((header) => header.getAttribute("title") ?? header.textContent);
    expect(headers).toEqual([
      "Jugador",
      "Minutos",
      "Goles",
      "Asistencias",
      "Tiros",
      "Pérdidas",
      "Robos",
      "Faltas",
      "Amarillas",
      "Rojas",
    ]);
  });

  it("tabla de quintetos con nombres, tiempo, goles y valoración media", async () => {
    api();
    renderWithAuth(<EstadisticasPage />);

    const table = await screen.findByRole("table", { name: "Quintetos" });
    const rows = within(table).getAllByRole("row");

    expect(within(rows[1]).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "Ana Ruiz, Bea Soto",
      "15:00",
      "2 – 1",
      "4,5 ★ (2)",
    ]);
    expect(within(rows[2]).getAllByRole("cell")[3]).toHaveTextContent("Sin valorar");
  });

  it("si el partido no está cerrado lo explica y enlaza al partido en vez de enseñar quintetos vacíos", async () => {
    stats = { ...STATS, closed: false, quintets: [] };
    api();
    renderWithAuth(<EstadisticasPage />);

    expect(await screen.findByText(/Partido sin cerrar/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir al partido" })).toHaveAttribute("href", "/partido?id=m1");
    expect(screen.queryByRole("table", { name: "Quintetos" })).not.toBeInTheDocument();
  });

  it("muestra los avisos del servidor", async () => {
    stats = { ...STATS, warnings: ["1 evento fuera de los tramos no cuenta para los quintetos"] };
    api();

    renderWithAuth(<EstadisticasPage />);

    expect(await screen.findByText(/fuera de los tramos/)).toBeInTheDocument();
  });

  it("avisa si el partido no existe", async () => {
    navigation.search = "id=desconocido";
    api({ "GET /matches/desconocido/stats": { status: 404, error: { code: "not_found", message: "No" } } });

    renderWithAuth(<EstadisticasPage />);

    expect(await screen.findByText("Partido no encontrado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a las estadísticas" })).toHaveAttribute(
      "href",
      "/estadisticas",
    );
  });

  it("avisa si no se pueden cargar las estadísticas y permite reintentar", async () => {
    api({ "GET /matches/m1/stats": { status: 500, error: { code: "internal_error", message: "Fallo" } } });

    renderWithAuth(<EstadisticasPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar las estadísticas");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("también las puede ver el segundo entrenador", async () => {
    api();

    renderWithAuth(<EstadisticasPage />, { user: fakeUser("assistant_coach") });

    expect(await screen.findByRole("table", { name: "Jugadores" })).toBeInTheDocument();
  });

  it("enlaza a la lista de partidos para volver", async () => {
    api();

    renderWithAuth(<EstadisticasPage />);

    expect(await screen.findByRole("link", { name: "Todas las estadísticas" })).toHaveAttribute(
      "href",
      "/estadisticas",
    );
  });
});
