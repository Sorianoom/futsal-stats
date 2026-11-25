import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setAccessToken } from "@/lib/api/client";
import type { Match } from "@/lib/api/match-types";
import { syncMatch } from "@/lib/api/matches";
import type { MatchStats, SeasonStats } from "@/lib/api/stats-types";
import { mockApi, type MockHandler } from "@/test/mock-api";
import { fakeUser, renderWithAuth } from "@/test/render-with-auth";

import EstadisticasPage from "./page";

const navigation = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const MATCH: Match = { id: "m1", session_id: "s1", held_on: "2026-10-20", opponent: "Rival FS", is_official: true };
const OLDER: Match = { id: "m0", session_id: "s0", held_on: "2026-10-13", opponent: "Cádiz", is_official: true };

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
      key_actions: 0,
      fouls: 2,
      yellows: 1,
      reds: 0,
      saves: 0,
      rating: 7.5,
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
      key_actions: 0,
      fouls: 0,
      yellows: 0,
      reds: 1,
      saves: 6,
      rating: null,
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
      key_actions: 5,
      fouls: 3,
      yellows: 1,
      reds: 0,
      saves: 0,
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
      key_actions: 0,
      fouls: 0,
      yellows: 0,
      reds: 1,
      saves: 11,
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

  it("marca los amistosos", async () => {
    matches = [MATCH, { ...OLDER, is_official: false }];
    api();

    renderWithAuth(<EstadisticasPage />, { user: fakeUser("player") });

    expect(await screen.findByRole("link", { name: /Cádiz/ })).toHaveTextContent("Amistoso");
    expect(screen.getByRole("link", { name: /Rival FS/ })).not.toHaveTextContent("Amistoso");
  });

  it("los ordena por fecha, de 2026 a 2027, aunque el servidor los mande al revés", async () => {
    matches = [
      { ...MATCH, id: "m3", held_on: "2027-02-28", opponent: "Deporama" },
      { ...MATCH, id: "m1", held_on: "2026-10-18", opponent: "Botellines" },
      { ...MATCH, id: "m4", held_on: "2027-01-24", opponent: "Nevada" },
    ];
    api();

    renderWithAuth(<EstadisticasPage />);

    const list = await screen.findByRole("list", { name: "Partidos" });
    expect(within(list).getAllByRole("link").map((link) => link.textContent)).toEqual([
      expect.stringContaining("Botellines"),
      expect.stringContaining("Nevada"),
      expect.stringContaining("Deporama"),
    ]);
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
      "2",
      "80:00",
      "40:00",
      "4",
      "2",
      "12",
      "6",
      "8",
      "5",
      "3",
      "1",
      "0",
      "0",
    ]);
    const bea = within(table).getByText("7 · Bea Soto").closest("tr") as HTMLElement;
    expect(within(bea).getAllByRole("cell")[2]).toHaveTextContent("05:05");
    expect(within(bea).getAllByRole("cell").at(-1)).toHaveTextContent("11");
    expect(within(table).getByRole("columnheader", { name: "Paradas" })).toBeInTheDocument();
    expect(within(table).queryByRole("columnheader", { name: "Nota" })).not.toBeInTheDocument();
  });

  it("dice de cuántos partidos cerrados sale el acumulado", async () => {
    api();

    renderWithAuth(<EstadisticasPage />);

    expect(await screen.findByText("Acumulado de 2 partidos cerrados")).toBeInTheDocument();
  });

  it("destaca a los líderes de la temporada", async () => {
    api();

    renderWithAuth(<EstadisticasPage />);

    const leaders = await screen.findByRole("list", { name: "Líderes de la temporada" });
    const goleador = within(leaders).getByText("Goleador").closest("li") as HTMLElement;
    expect(within(goleador).getByText("Ana Ruiz")).toBeInTheDocument();
    expect(within(goleador).getByText("4")).toBeInTheDocument();
    const minutos = within(leaders).getByText("Más minutos").closest("li") as HTMLElement;
    expect(within(minutos).getByText("80:00")).toBeInTheDocument();
  });

  it("sin partidos cerrados no hay líderes", async () => {
    season = { matches: 0, players: [], warnings: [] };
    api();

    renderWithAuth(<EstadisticasPage />);

    await screen.findByText(/Todavía no hay partidos cerrados/);
    expect(screen.queryByRole("list", { name: "Líderes de la temporada" })).not.toBeInTheDocument();
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

  it("en el móvil enseña un grupo de columnas a la vez, además de minutos y nota", async () => {
    api();
    renderWithAuth(<EstadisticasPage />);
    const table = await screen.findByRole("table", { name: "Jugadores" });
    const header = (title: string) => within(table).getByRole("columnheader", { name: title });
    const groups = screen.getAllByRole("group", { name: "Columnas" }).at(-1) as HTMLElement;

    expect(within(groups).getByRole("button", { name: "Ataque" })).toHaveAttribute("aria-pressed", "true");
    expect(header("Goles")).not.toHaveClass("hidden");
    expect(header("Robos")).toHaveClass("hidden", "sm:table-cell");
    expect(header("Minutos")).not.toHaveClass("hidden");
    expect(header("Nota")).not.toHaveClass("hidden");

    await userEvent.click(within(groups).getByRole("button", { name: "Defensa" }));

    expect(header("Robos")).not.toHaveClass("hidden");
    expect(header("Acciones clave")).not.toHaveClass("hidden");
    expect(header("Goles")).toHaveClass("hidden", "sm:table-cell");
  });

  it("tabla de jugadores con minutos en mm:ss y todas las acciones", async () => {
    api();
    renderWithAuth(<EstadisticasPage />);

    const table = await screen.findByRole("table", { name: "Jugadores" });
    const ana = within(table).getByText("9 · Ana Ruiz").closest("tr") as HTMLElement;
    const cells = within(ana).getAllByRole("cell").map((cell) => cell.textContent);

    expect(cells).toEqual(["40:00", "2", "1", "6", "3", "4", "0", "2", "1", "0", "0", "7,5"]);
    const bea = within(table).getByText("7 · Bea Soto").closest("tr") as HTMLElement;
    expect(within(bea).getAllByRole("cell")[0]).toHaveTextContent("05:05");
    expect(within(bea).getAllByRole("cell")[9]).toHaveTextContent("1");
    expect(within(bea).getAllByRole("cell")[10]).toHaveTextContent("6");
  });

  it("la nota lleva un decimal con coma y una raya si no hay nota", async () => {
    stats = {
      ...STATS,
      players: [
        { ...STATS.players[0], rating: 10 },
        { ...STATS.players[1], rating: null },
      ],
    };
    api();
    renderWithAuth(<EstadisticasPage />);

    const table = await screen.findByRole("table", { name: "Jugadores" });
    const ana = within(table).getByText("9 · Ana Ruiz").closest("tr") as HTMLElement;
    const bea = within(table).getByText("7 · Bea Soto").closest("tr") as HTMLElement;

    expect(within(ana).getAllByRole("cell").at(-1)).toHaveTextContent("10,0");
    expect(within(bea).getAllByRole("cell").at(-1)).toHaveTextContent("—");
  });

  it("el nombre del jugador es la cabecera de su fila y las columnas se leen con su nombre completo", async () => {
    api();
    renderWithAuth(<EstadisticasPage />);

    const table = await screen.findByRole("table", { name: "Jugadores" });

    expect(within(table).getByRole("rowheader", { name: "9 · Ana Ruiz" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Goles" })).toHaveAttribute("scope", "col");
    expect(within(table).getByRole("columnheader", { name: "Rojas" })).toBeInTheDocument();
  });

  it("la tabla se puede desplazar con teclado en pantallas estrechas", async () => {
    api();
    renderWithAuth(<EstadisticasPage />);

    const region = await screen.findByRole("region", { name: "Tabla de jugadores" });

    expect(region).toHaveAttribute("tabindex", "0");
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
      "Acciones clave",
      "Faltas",
      "Amarillas",
      "Rojas",
      "Paradas",
      "Nota",
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

  it("al jugador no le enlaza al partido sin cerrar, que es una pantalla de entrenador", async () => {
    stats = { ...STATS, closed: false, quintets: [] };
    api();
    renderWithAuth(<EstadisticasPage />, { user: fakeUser("player") });

    expect(await screen.findByText(/Partido sin cerrar/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ir al partido" })).not.toBeInTheDocument();
  });

  it("al jugador no le enseña la sección de quintetos aunque el partido esté cerrado", async () => {
    stats = { ...STATS, quintets: [], warnings: [] };
    api();
    renderWithAuth(<EstadisticasPage />, { user: fakeUser("player") });

    expect(await screen.findByRole("table", { name: "Jugadores" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Quintetos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Quintetos" })).not.toBeInTheDocument();
    expect(screen.queryByText(/quinteto/i)).not.toBeInTheDocument();
  });

  it("al jugador con el partido sin cerrar no le habla de quintetos", async () => {
    stats = { ...STATS, closed: false, quintets: [], warnings: [] };
    api();
    renderWithAuth(<EstadisticasPage />, { user: fakeUser("player") });

    expect(await screen.findByText(/Partido sin cerrar/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Quintetos" })).not.toBeInTheDocument();
    expect(screen.queryByText(/quinteto/i)).not.toBeInTheDocument();
  });

  it("al jugador no le enseña avisos aunque llegaran", async () => {
    stats = { ...STATS, quintets: [], warnings: ["1 evento fuera de los tramos no cuenta para los quintetos"] };
    api();
    renderWithAuth(<EstadisticasPage />, { user: fakeUser("player") });

    expect(await screen.findByRole("table", { name: "Jugadores" })).toBeInTheDocument();
    expect(screen.queryByText(/fuera de los tramos/)).not.toBeInTheDocument();
  });

  it("al jugador sí le enseña la nota de cada jugador", async () => {
    api();
    renderWithAuth(<EstadisticasPage />, { user: fakeUser("player") });

    const table = await screen.findByRole("table", { name: "Jugadores" });
    expect(within(table).getByRole("columnheader", { name: "Nota" })).toBeInTheDocument();
  });

  it("muestra los avisos del servidor", async () => {
    stats = { ...STATS, warnings: ["1 evento fuera de los tramos no cuenta para los quintetos"] };
    api();

    renderWithAuth(<EstadisticasPage />);

    expect(await screen.findByText(/fuera de los tramos/)).toBeInTheDocument();
  });

  it("un partido con eventos incoherentes se explica y ofrece corregirlo en vez de reintentar sin fin", async () => {
    api({
      "GET /matches/m1/stats": {
        status: 409,
        error: { code: "conflict", message: "El registro de eventos no es coherente" },
      },
    });

    renderWithAuth(<EstadisticasPage />);

    expect(await screen.findByText("Los eventos de este partido no son coherentes")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Corregir partido" })).toHaveAttribute(
      "href",
      "/corregir?id=m1",
    );
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
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

  it("el entrenador ve el enlace para corregir el partido y el segundo entrenador no", async () => {
    api();
    const { unmount } = renderWithAuth(<EstadisticasPage />);
    expect(await screen.findByRole("link", { name: "Corregir partido" })).toHaveAttribute(
      "href",
      "/corregir?id=m1",
    );
    unmount();

    renderWithAuth(<EstadisticasPage />, { user: fakeUser("assistant_coach") });
    await screen.findByRole("table", { name: "Jugadores" });

    expect(screen.queryByRole("link", { name: "Corregir partido" })).not.toBeInTheDocument();
  });

  it("también las puede ver el segundo entrenador", async () => {
    api();

    renderWithAuth(<EstadisticasPage />, { user: fakeUser("assistant_coach") });

    expect(await screen.findByRole("table", { name: "Jugadores" })).toBeInTheDocument();
  });

  it.each(["head_coach", "assistant_coach"] as const)(
    "%s marca un partido como amistoso y luego otra vez como oficial",
    async (role) => {
      const server = api({
        "PATCH /matches/m1": (request) => {
          const { is_official } = request.body as { is_official: boolean };
          matches = matches.map((m) => (m.id === "m1" ? { ...m, is_official } : m));
          return { data: { ...MATCH, is_official } };
        },
      });
      renderWithAuth(<EstadisticasPage />, { user: fakeUser(role) });
      expect(await screen.findByText("Oficial · cuenta para el Fantasy")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Marcar como amistoso" }));
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent("Fantasy");
      await userEvent.click(within(dialog).getByRole("button", { name: "Marcar como amistoso" }));

      expect(await screen.findByText("Amistoso · no cuenta para el Fantasy")).toBeInTheDocument();
      expect(server.calls.find((c) => c.method === "PATCH")?.body).toEqual({ is_official: false });

      await userEvent.click(screen.getByRole("button", { name: "Marcar como oficial" }));
      await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Marcar como oficial" }));

      expect(await screen.findByText("Oficial · cuenta para el Fantasy")).toBeInTheDocument();
    },
  );

  it("avisa si no se pudo cambiar si el partido es oficial", async () => {
    api({ "PATCH /matches/m1": { status: 500, error: { code: "internal_error", message: "x" } } });
    renderWithAuth(<EstadisticasPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Marcar como amistoso" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Marcar como amistoso" }));

    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("No se pudo cambiar");
  });

  it("el jugador ve si es amistoso pero no puede cambiarlo", async () => {
    matches = [{ ...MATCH, is_official: false }, OLDER];
    api();

    renderWithAuth(<EstadisticasPage />, { user: fakeUser("player") });

    expect(await screen.findByText("Amistoso · no cuenta para el Fantasy")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Marcar como/ })).not.toBeInTheDocument();
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

describe("EstadisticasPage: caché del detalle de un partido", () => {
  it("al volver a abrir el detalle enseña al momento lo ya visto", async () => {
    api();
    const { unmount } = renderWithAuth(<EstadisticasPage />);
    await screen.findByRole("table", { name: "Jugadores" });
    unmount();

    renderWithAuth(<EstadisticasPage />);

    // Sin esperar a la red: sale de la caché y se refresca por detrás.
    expect(screen.getByRole("table", { name: "Jugadores" })).toBeInTheDocument();
    expect(screen.getByLabelText("Marcador")).toHaveTextContent("2 – 1");
    expect(screen.getByRole("heading", { name: /Rival FS/ })).toBeInTheDocument();
  });

  it("refresca por detrás lo cacheado y enseña lo nuevo", async () => {
    const server = api();
    const { unmount } = renderWithAuth(<EstadisticasPage />);
    await screen.findByRole("table", { name: "Jugadores" });
    unmount();
    stats = { ...STATS, score: { goals_for: 4, goals_against: 1 } };

    renderWithAuth(<EstadisticasPage />);

    expect(await screen.findByText("4 – 1")).toBeInTheDocument();
    expect(server.count("GET", "/matches/m1/stats")).toBe(2);
  });

  it("tras corregir eventos de ese partido no enseña las estadísticas viejas", async () => {
    api({ "POST /matches/m1/sync": { data: { accepted: ["e1"], duplicates: [], rejected: [] } } });
    const { unmount } = renderWithAuth(<EstadisticasPage />);
    await screen.findByRole("table", { name: "Jugadores" });
    unmount();

    await syncMatch("m1", { events: [] });
    stats = { ...STATS, score: { goals_for: 3, goals_against: 1 } };
    renderWithAuth(<EstadisticasPage />);

    expect(screen.queryByText("2 – 1")).not.toBeInTheDocument();
    expect(screen.getByText("Cargando estadísticas…")).toBeInTheDocument();
    expect(await screen.findByText("3 – 1")).toBeInTheDocument();
  });

  it("un partido incoherente ya corregido no sigue saliendo como incoherente", async () => {
    let incoherent = true;
    api({
      "GET /matches/m1/stats": () =>
        incoherent
          ? { status: 409, error: { code: "conflict", message: "No coherente" } }
          : { data: stats },
      "POST /matches/m1/sync": { data: { accepted: ["e1"], duplicates: [], rejected: [] } },
    });
    const { unmount } = renderWithAuth(<EstadisticasPage />);
    await screen.findByText("Los eventos de este partido no son coherentes");
    unmount();

    await syncMatch("m1", { events: [] });
    incoherent = false;
    renderWithAuth(<EstadisticasPage />);

    expect(screen.queryByText("Los eventos de este partido no son coherentes")).not.toBeInTheDocument();
    expect(await screen.findByRole("table", { name: "Jugadores" })).toBeInTheDocument();
  });

  it("si falla el refresco conserva lo ya visto y permite reintentar", async () => {
    let down = false;
    api({
      "GET /matches/m1/stats": () =>
        down ? { status: 500, error: { code: "internal_error", message: "Fallo" } } : { data: stats },
    });
    const { unmount } = renderWithAuth(<EstadisticasPage />);
    await screen.findByRole("table", { name: "Jugadores" });
    unmount();
    down = true;

    renderWithAuth(<EstadisticasPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar las estadísticas");
    expect(screen.getByRole("table", { name: "Jugadores" })).toBeInTheDocument();
    down = false;
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("table", { name: "Jugadores" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("al cerrar la sesión olvida el detalle cacheado", async () => {
    api();
    const { unmount } = renderWithAuth(<EstadisticasPage />);
    await screen.findByRole("table", { name: "Jugadores" });
    unmount();

    setAccessToken(null);
    renderWithAuth(<EstadisticasPage />);

    expect(screen.queryByRole("table", { name: "Jugadores" })).not.toBeInTheDocument();
    expect(screen.getByText("Cargando estadísticas…")).toBeInTheDocument();
  });
});
