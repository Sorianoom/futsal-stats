import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { ME, ROUND, STANDINGS, markPacksSeen } from "@/test/fantasy-fixtures";
import { mockApi, type MockHandler } from "@/test/mock-api";
import { fakeUser, renderWithAuth } from "@/test/render-with-auth";

import FantasyPage from "./page";

beforeEach(() => markPacksSeen());

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

/** Toca un hueco de la pista y elige una ficha en la hoja que se abre. */
async function pick(editor: HTMLElement, slot: string, player: string) {
  await userEvent.click(within(editor).getByRole("button", { name: slot }));
  const sheet = screen.getByRole("dialog", { name: slot.split(":")[0] });
  await userEvent.click(within(sheet).getByRole("button", { name: player }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
}

describe("Fantasy con liga", () => {
  it("quien entra por primera vez abre un sobre por cada jugador de su equipo", async () => {
    window.localStorage.clear();
    api();

    renderWithAuth(<FantasyPage />, { user: fakeUser("player") });

    const packs = await screen.findByRole("dialog", { name: "Tus sobres" });
    expect(packs).toHaveTextContent(`Tienes ${ME.squad.length} sobres`);
  });

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
    expect(within(editor).getByRole("button", { name: "Portero: vacío" })).toBeInTheDocument();
    expect(within(editor).getByRole("button", { name: "Pívot: Ana Ruiz" })).toBeInTheDocument();
  });

  it("el jugador edita y guarda su alineación", async () => {
    const server = api({
      "PUT /fantasy/lineup": (request) => ({ data: request.body }),
    });
    renderWithAuth(<FantasyPage />, { user: fakeUser("player") });
    const editor = await screen.findByRole("region", { name: "Alineación" });
    const save = within(editor).getByRole("button", { name: "Guardar alineación" });
    expect(save).toBeDisabled();

    await pick(editor, "Portero: vacío", "Elena Paz");
    await pick(editor, "Ala derecha: vacío", "Dani Gil");
    expect(within(editor).getByRole("button", { name: "Ala derecha: Dani Gil" })).toBeInTheDocument();
    await userEvent.click(save);

    expect(await within(editor).findByRole("status")).toHaveTextContent("Alineación guardada");
    expect(server.calls.find((call) => call.method === "PUT")?.body).toEqual({
      goalkeeper_copy_id: "g1",
      field_copy_ids: ["c1", "c2", "c3", null],
      captain_copy_id: null,
    });
  });

  it("cada alineado enseña sus puntos de la última jornada", async () => {
    const scored = {
      ...ME,
      last_round: { match_id: "m2", opponent: "Rival FS", held_on: "2026-11-08" },
      squad: ME.squad.map((copy) => ({ ...copy, last_points: copy.copy_id === "c1" ? 9 : 3 })),
    };
    api({ "GET /fantasy/me": { data: scored } });
    renderWithAuth(<FantasyPage />, { user: fakeUser("player") });

    const editor = await screen.findByRole("region", { name: "Alineación" });

    expect(editor).toHaveTextContent("Puntos de la última jornada, vs Rival FS");
    expect(within(editor).getByLabelText("Ana Ruiz: 9 puntos en la última jornada")).toBeInTheDocument();
    expect(within(editor).getByLabelText("Bea Soto: 3 puntos en la última jornada")).toBeInTheDocument();
  });

  it("sin jornadas puntuadas no enseña puntos", async () => {
    api();
    renderWithAuth(<FantasyPage />, { user: fakeUser("player") });

    const editor = await screen.findByRole("region", { name: "Alineación" });

    expect(within(editor).queryByLabelText(/puntos en la última jornada/)).not.toBeInTheDocument();
  });

  it("elige capitán entre los alineados y lo guarda", async () => {
    const server = api({ "PUT /fantasy/lineup": (request) => ({ data: request.body }) });
    renderWithAuth(<FantasyPage />, { user: fakeUser("player") });
    const editor = await screen.findByRole("region", { name: "Alineación" });
    await userEvent.click(within(editor).getByRole("button", { name: "Ala izquierda: Bea Soto" }));
    const sheet = screen.getByRole("dialog", { name: "Ala izquierda" });
    const captain = within(sheet).getByRole("button", { name: "Capitán: Bea Soto" });
    expect(captain).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(captain);
    await userEvent.click(within(editor).getByRole("button", { name: "Guardar alineación" }));

    expect(within(editor).getByRole("button", { name: "Ala izquierda: Bea Soto, capitán" })).toBeInTheDocument();
    expect(await within(editor).findByRole("status")).toHaveTextContent("Alineación guardada");
    expect(server.calls.find((call) => call.method === "PUT")?.body).toMatchObject({ captain_copy_id: "c2" });
  });

  it("las fichas enseñan la foto del jugador si la tiene", async () => {
    const withPhoto = {
      ...ME,
      squad: ME.squad.map((copy) => (copy.copy_id === "c1" ? { ...copy, photo_url: "/player-photos/ana" } : copy)),
    };
    api({ "GET /fantasy/me": { data: withPhoto } });
    renderWithAuth(<FantasyPage />);
    const editor = await screen.findByRole("region", { name: "Alineación" });

    const photo = within(within(editor).getByRole("button", { name: "Pívot: Ana Ruiz" })).getByRole("img", {
      name: "Ana Ruiz",
    });

    expect(photo.getAttribute("src")).toMatch(/\/player-photos\/ana$/);
  });

  it("desde la hoja se puede dejar un hueco vacío", async () => {
    api();
    renderWithAuth(<FantasyPage />);
    const editor = await screen.findByRole("region", { name: "Alineación" });

    await userEvent.click(within(editor).getByRole("button", { name: "Pívot: Ana Ruiz" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Dejar vacío" }));

    expect(within(editor).getByRole("button", { name: "Pívot: vacío" })).toBeInTheDocument();
    expect(within(editor).getByRole("button", { name: "Guardar alineación" })).toBeEnabled();
  });

  it("un hueco de campo no ofrece al portero ni a quien ya está alineado", async () => {
    api();
    renderWithAuth(<FantasyPage />);
    const editor = await screen.findByRole("region", { name: "Alineación" });

    await userEvent.click(within(editor).getByRole("button", { name: "Ala derecha: vacío" }));
    const sheet = screen.getByRole("dialog", { name: "Ala derecha" });
    const cards = within(within(sheet).getByRole("list", { name: "Jugadores para este hueco" })).getAllByRole("button");

    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual(["Dani Gil"]);
    expect(within(sheet).queryByRole("button", { name: "Capitán: Dani Gil" })).not.toBeInTheDocument();
  });

  it("explica una alineación rechazada por el servidor", async () => {
    api({
      "PUT /fantasy/lineup": { status: 422, error: { code: "invalid_lineup", message: "x" } },
    });
    renderWithAuth(<FantasyPage />);
    const editor = await screen.findByRole("region", { name: "Alineación" });

    await pick(editor, "Ala derecha: vacío", "Dani Gil");
    await userEvent.click(within(editor).getByRole("button", { name: "Guardar alineación" }));

    expect(await within(editor).findByRole("alert")).toHaveTextContent("La alineación no es válida");
    expect(within(editor).getByRole("button", { name: "Ala derecha: Dani Gil" })).toBeInTheDocument();
  });

  it("avisa de un fallo de red al guardar", async () => {
    api({ "PUT /fantasy/lineup": { status: 500, error: { code: "internal_error", message: "x" } } });
    renderWithAuth(<FantasyPage />);
    const editor = await screen.findByRole("region", { name: "Alineación" });

    await pick(editor, "Ala derecha: vacío", "Dani Gil");
    await userEvent.click(within(editor).getByRole("button", { name: "Guardar alineación" }));

    expect(await within(editor).findByRole("alert")).toHaveTextContent("No se pudo guardar");
  });

  it("la clasificación muestra total y jornadas, marca las pendientes y resalta mi fila", async () => {
    api();

    renderWithAuth(<FantasyPage />, { user: fakeUser("player") });
    await userEvent.click(await screen.findByRole("tab", { name: "Clasificación" }));

    const table = await screen.findByRole("table", { name: "Clasificación" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("Míster");
    expect(rows[1]).toHaveTextContent("40");
    expect(rows[2]).toHaveAttribute("aria-current", "true");
    expect(within(rows[2]).getByText("Tú")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Pendiente")).toBeInTheDocument();
  });

  it("tocar una jornada enseña mi alineación con nota, goles y puntos", async () => {
    api();
    renderWithAuth(<FantasyPage />, { user: fakeUser("player") });
    await userEvent.click(await screen.findByRole("tab", { name: "Clasificación" }));
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

  it("en el detalle de una jornada se ve quién fue capitán", async () => {
    const withCaptain = {
      ...ROUND,
      slots: ROUND.slots.map((slot) => (slot.copy_id === "c2" ? { ...slot, captain: true, points: 12 } : slot)),
    };
    api({ "GET /fantasy/rounds/m1/me": { data: withCaptain } });
    renderWithAuth(<FantasyPage />, { user: fakeUser("player") });
    await userEvent.click(await screen.findByRole("tab", { name: "Clasificación" }));
    const table = await screen.findByRole("table", { name: "Clasificación" });

    await userEvent.click(within(table).getByRole("button", { name: /Betis/ }));

    const dialog = await screen.findByRole("dialog");
    const bea = await within(dialog).findByRole("row", { name: /Bea Soto/ });
    expect(within(bea).getByText("Capitán · ×2")).toBeInTheDocument();
    expect(bea).toHaveTextContent("12");
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

    await pick(editor, "Ala derecha: vacío", "Dani Gil");
    await userEvent.click(within(editor).getByRole("button", { name: "Guardar alineación" }));

    await waitFor(() => expect(server.count("GET", "/fantasy/me")).toBeGreaterThan(before));
  });
});

describe("Cuenta de partidos del cuerpo técnico", () => {
  it("solo ve la clasificación, sin equipo ni jornadas que abrir, pero sí el equipo de cada uno", async () => {
    api({ "GET /fantasy/me": { data: { league: ME.league, spectator: true } } });

    renderWithAuth(<FantasyPage />, { user: fakeUser("assistant_coach") });

    expect(await screen.findByText(/solo ves la clasificación/)).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "Clasificación" });
    expect(within(table).queryByRole("button", { name: /Betis|Almería|Cádiz/ })).not.toBeInTheDocument();
    expect(within(table).getByRole("button", { name: "Carla Ruiz" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Mercado" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Mi plantilla" })).not.toBeInTheDocument();
  });
});
