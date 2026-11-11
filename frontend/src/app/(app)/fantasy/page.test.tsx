import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { FantasyLeagueView, FantasyLineup, FantasyRound, FantasyStandings } from "@/lib/api/fantasy-types";
import { mockApi, type MockHandler } from "@/test/mock-api";
import { fakeUser, renderWithAuth } from "@/test/render-with-auth";

import FantasyPage from "./page";

const LINEUP: FantasyLineup = { goalkeeper_copy_id: null, field_copy_ids: ["c1", "c2", null, null] };

const ME: FantasyLeagueView = {
  league: { id: "l1", starts_on: "2026-11-01" },
  me: { participant_id: "pa2", display_name: "Carla Ruiz", balance: 20000 },
  squad: [
    { copy_id: "c1", player_id: "p1", name: "Ana Ruiz", dorsal: 9, position: "field", value: 4000 },
    { copy_id: "c2", player_id: "p2", name: "Bea Soto", dorsal: 7, position: "field", value: 4200 },
    { copy_id: "c3", player_id: "p3", name: "Dani Gil", dorsal: 5, position: "field", value: 3800 },
    { copy_id: "g1", player_id: "p4", name: "Elena Paz", dorsal: 1, position: "goalkeeper", value: 4000 },
  ],
  lineup: LINEUP,
  next_round: { match_id: "m3", opponent: "Nevada", held_on: "2026-11-15", locks_at: "2026-11-14T23:00:00Z" },
};

const STANDINGS: FantasyStandings = {
  rounds: [
    { match_id: "m1", opponent: "Betis", held_on: "2026-11-01", status: "scored" },
    { match_id: "m2", opponent: "Cádiz", held_on: "2026-11-08", status: "pending" },
  ],
  rows: [
    { participant_id: "pa1", display_name: "Míster", total: 30, points_by_round: { m1: 30 } },
    { participant_id: "pa2", display_name: "Carla Ruiz", total: 25, points_by_round: { m1: 25 } },
  ],
};

const ROUND: FantasyRound = {
  match_id: "m1",
  status: "scored",
  total: 25,
  slots: [
    { slot: "goalkeeper", copy_id: null, player_id: null, name: null, rating: null, goals: 0, points: 0 },
    { slot: "field", copy_id: "c1", player_id: "p1", name: "Ana Ruiz", rating: 9.3, goals: 2, points: 13 },
    { slot: "field", copy_id: "c2", player_id: "p2", name: "Bea Soto", rating: 6.3, goals: 0, points: 6 },
    { slot: "field", copy_id: "c3", player_id: "p3", name: "Dani Gil", rating: 6.0, goals: 0, points: 6 },
    { slot: "field", copy_id: null, player_id: null, name: null, rating: null, goals: 0, points: 0 },
  ],
};

function api(extra: Record<string, MockHandler> = {}) {
  return mockApi({
    "GET /fantasy/me": { data: ME },
    "GET /fantasy/standings": { data: STANDINGS },
    "GET /fantasy/rounds/m1/me": { data: ROUND },
    ...extra,
  });
}

describe("Fantasy sin liga", () => {
  it("el entrenador principal crea la liga tras confirmar el reparto", async () => {
    let created = false;
    const server = api({
      "GET /fantasy/me": () => ({ data: created ? ME : { league: null } }),
      "POST /fantasy/league": () => {
        created = true;
        return { status: 201, data: { id: "l1", starts_on: "2026-11-01", participants: 15 } };
      },
    });
    renderWithAuth(<FantasyPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Crear liga" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("2 jugadores de campo al azar");
    expect(dialog).toHaveTextContent("cuenta activa");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crear liga" }));

    expect(await screen.findByText("20,0 M")).toBeInTheDocument();
    expect(server.count("POST", "/fantasy/league")).toBe(1);
  });

  it("si la liga ya existía lo dice y carga la liga", async () => {
    let created = false;
    api({
      "GET /fantasy/me": () => ({ data: created ? ME : { league: null } }),
      "POST /fantasy/league": () => {
        created = true;
        return { status: 409, error: { code: "league_exists", message: "Ya existe" } };
      },
    });
    renderWithAuth(<FantasyPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Crear liga" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Crear liga" }));

    expect(await screen.findByText("20,0 M")).toBeInTheDocument();
  });

  it.each(["assistant_coach", "player"] as const)("%s no puede crear la liga", async (role) => {
    api({ "GET /fantasy/me": { data: { league: null } } });

    renderWithAuth(<FantasyPage />, { user: fakeUser(role) });

    expect(await screen.findByText(/Todavía no hay liga/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crear liga" })).not.toBeInTheDocument();
  });

  it("avisa si no se pudo cargar y deja reintentar", async () => {
    api({ "GET /fantasy/me": { status: 500, error: { code: "internal_error", message: "Fallo" } } });

    renderWithAuth(<FantasyPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar el Fantasy");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});

describe("Fantasy con liga", () => {
  it("muestra saldo, próxima jornada con su bloqueo y la plantilla con su valor", async () => {
    api();

    renderWithAuth(<FantasyPage />, { user: fakeUser("player") });

    expect(await screen.findByText("20,0 M")).toBeInTheDocument();
    expect(screen.getByText("vs Nevada")).toBeInTheDocument();
    expect(screen.getByText("Se bloquea el domingo, 15 de noviembre a las 00:00")).toBeInTheDocument();
    const squad = screen.getByRole("list", { name: "Mi plantilla" });
    expect(within(squad).getAllByRole("listitem")).toHaveLength(4);
    expect(within(squad).getByText("Bea Soto").closest("li")).toHaveTextContent("4,2 M");
  });

  it("marca los huecos vacíos y que puntúan 0", async () => {
    api();

    renderWithAuth(<FantasyPage />, { user: fakeUser("player") });

    const editor = await screen.findByRole("region", { name: "Alineación" });
    expect(within(editor).getAllByText("Vacío · 0 puntos")).toHaveLength(3);
    expect(within(editor).getByLabelText("Portero")).toHaveValue("");
    expect(within(editor).getByLabelText("Campo 1")).toHaveValue("c1");
  });

  it("el jugador edita y guarda su alineación", async () => {
    const server = api({
      "PUT /fantasy/lineup": (request) => ({ data: request.body }),
    });
    renderWithAuth(<FantasyPage />, { user: fakeUser("player") });
    const editor = await screen.findByRole("region", { name: "Alineación" });
    const save = within(editor).getByRole("button", { name: "Guardar alineación" });
    expect(save).toBeDisabled();

    await userEvent.selectOptions(within(editor).getByLabelText("Portero"), "g1");
    await userEvent.selectOptions(within(editor).getByLabelText("Campo 3"), "c3");
    await userEvent.click(save);

    expect(await within(editor).findByRole("status")).toHaveTextContent("Alineación guardada");
    expect(server.calls.find((call) => call.method === "PUT")?.body).toEqual({
      goalkeeper_copy_id: "g1",
      field_copy_ids: ["c1", "c2", "c3", null],
    });
  });

  it("un hueco de campo no ofrece al portero ni a quien ya está alineado", async () => {
    api();
    renderWithAuth(<FantasyPage />);
    const editor = await screen.findByRole("region", { name: "Alineación" });

    const options = within(within(editor).getByLabelText("Campo 3")).getAllByRole("option");

    expect(options.map((option) => option.textContent)).toEqual(["Vacío", "5 · Dani Gil"]);
  });

  it("explica una alineación rechazada por el servidor", async () => {
    api({
      "PUT /fantasy/lineup": { status: 422, error: { code: "invalid_lineup", message: "x" } },
    });
    renderWithAuth(<FantasyPage />);
    const editor = await screen.findByRole("region", { name: "Alineación" });

    await userEvent.selectOptions(within(editor).getByLabelText("Campo 3"), "c3");
    await userEvent.click(within(editor).getByRole("button", { name: "Guardar alineación" }));

    expect(await within(editor).findByRole("alert")).toHaveTextContent("La alineación no es válida");
    expect(within(editor).getByLabelText("Campo 3")).toHaveValue("c3");
  });

  it("avisa de un fallo de red al guardar", async () => {
    api({ "PUT /fantasy/lineup": { status: 500, error: { code: "internal_error", message: "x" } } });
    renderWithAuth(<FantasyPage />);
    const editor = await screen.findByRole("region", { name: "Alineación" });

    await userEvent.selectOptions(within(editor).getByLabelText("Campo 3"), "c3");
    await userEvent.click(within(editor).getByRole("button", { name: "Guardar alineación" }));

    expect(await within(editor).findByRole("alert")).toHaveTextContent("No se pudo guardar");
  });

  it("la clasificación muestra total y jornadas, marca las pendientes y resalta mi fila", async () => {
    api();

    renderWithAuth(<FantasyPage />, { user: fakeUser("player") });

    const table = await screen.findByRole("table", { name: "Clasificación" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("Míster");
    expect(rows[1]).toHaveTextContent("30");
    expect(rows[2]).toHaveAttribute("aria-current", "true");
    expect(within(rows[2]).getByText("Tú")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Pendiente")).toBeInTheDocument();
  });

  it("tocar una jornada enseña mi alineación con nota, goles y puntos", async () => {
    api();
    renderWithAuth(<FantasyPage />, { user: fakeUser("player") });
    const table = await screen.findByRole("table", { name: "Clasificación" });

    await userEvent.click(within(table).getByRole("button", { name: /Betis/ }));

    const dialog = await screen.findByRole("dialog");
    const ana = await within(dialog).findByRole("row", { name: /Ana Ruiz/ });
    expect(ana).toHaveTextContent("9,3");
    expect(ana).toHaveTextContent("2");
    expect(ana).toHaveTextContent("13");
    expect(within(dialog).getAllByText("Vacío · 0 puntos")).toHaveLength(2);
    expect(dialog).toHaveTextContent("25 puntos");
  });

  it("sin próxima jornada lo dice", async () => {
    api({ "GET /fantasy/me": { data: { ...ME, next_round: null } } });

    renderWithAuth(<FantasyPage />);

    expect(await screen.findByText("No hay ninguna jornada programada")).toBeInTheDocument();
  });

  it("con saldo negativo avisa de que la jornada puntuaría 0", async () => {
    api({ "GET /fantasy/me": { data: { ...ME, me: { ...ME.me, balance: -500 } } } });

    renderWithAuth(<FantasyPage />);

    expect(await screen.findByText("-0,5 M")).toBeInTheDocument();
    expect(screen.getByText(/saldo negativo/)).toBeInTheDocument();
  });

  it("guardar vuelve a pedir mi Fantasy", async () => {
    const server = api({ "PUT /fantasy/lineup": (request) => ({ data: request.body }) });
    renderWithAuth(<FantasyPage />);
    const editor = await screen.findByRole("region", { name: "Alineación" });
    const before = server.count("GET", "/fantasy/me");

    await userEvent.selectOptions(within(editor).getByLabelText("Campo 3"), "c3");
    await userEvent.click(within(editor).getByRole("button", { name: "Guardar alineación" }));

    await waitFor(() => expect(server.count("GET", "/fantasy/me")).toBeGreaterThan(before));
  });
});
