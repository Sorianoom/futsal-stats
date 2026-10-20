import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import type { LineupEventRecord, LoggedEvent, Match, StintRecord } from "@/lib/api/match-types";
import type { Player } from "@/lib/api/types";
import { mockApi, type MockHandler } from "@/test/mock-api";
import { renderWithAuth } from "@/test/render-with-auth";

import PartidoPage from "./page";

const navigation = vi.hoisted(() => ({ search: "id=m1", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ push: navigation.push, replace: vi.fn() }),
}));

const NAMES = ["Ana", "Bea", "Carla", "Dani", "Elena", "Fran", "Gema"];
const PLAYERS: Player[] = NAMES.map((name, index) => ({
  id: `p${index + 1}`,
  name: `${name} Ruiz`,
  dorsal: index + 2,
  position: index === 5 ? "goalkeeper" : "field",
  status: "available",
  is_active: true,
}));
const MATCH: Match = { id: "m1", session_id: "s1", held_on: "2026-10-20", opponent: "Rival FS" };

const lineupOf = (...payloads: LineupEventRecord["payload"][]): LineupEventRecord[] =>
  payloads.map((payload, index) => ({ id: `l${index + 1}`, seq: index + 1, payload }));
const STARTERS = ["p1", "p2", "p3", "p4", "p5"];
const PART_1 = lineupOf({ type: "part_started", part: 1, starters: STARTERS });

interface SyncBody {
  lineup_events: { id: string; seq: number; payload: Record<string, unknown> }[];
  events: { id: string }[];
}

let lineup: LineupEventRecord[];
let events: LoggedEvent[];
let stints: StintRecord[];

beforeEach(() => {
  navigation.search = "id=m1";
  window.localStorage.clear();
  lineup = PART_1;
  events = [];
  stints = [];
});

afterEach(() => window.localStorage.clear());

const acceptAll: MockHandler = (request) => {
  const body = request.body as SyncBody;
  const accepted = [...body.events, ...body.lineup_events].map((item) => item.id);
  return { data: { accepted, duplicates: [], rejected: [] } };
};

function api(extra: Record<string, MockHandler> = {}) {
  return mockApi({
    "GET /matches": { data: [MATCH] },
    "GET /players": { data: PLAYERS },
    "GET /matches/m1/lineup-events": () => ({ data: lineup }),
    "GET /matches/m1/events": () => ({ data: events }),
    "GET /matches/m1/stints": () => ({ data: stints }),
    "GET /callup": { data: { starters: { guaranteed: [] } } },
    "POST /matches/m1/sync": acceptAll,
    ...extra,
  });
}

const posts = (server: ReturnType<typeof mockApi>) =>
  server.calls.filter((c) => c.method === "POST" && c.path.endsWith("/sync")).map((c) => c.body as SyncBody);

async function typeTime(digits: string) {
  const keypad = screen.getByRole("dialog");
  for (const digit of digits) {
    await userEvent.click(within(keypad).getByRole("button", { name: digit }));
  }
  await userEvent.click(within(keypad).getByRole("button", { name: "Aceptar" }));
}

async function endPart() {
  await userEvent.click(await screen.findByRole("button", { name: "Fin de la parte" }));
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Aceptar" }));
}

describe("fin de parte y parte 2", () => {
  it("el fin de la parte arranca en lo que marcaría el final y pasa al descanso", async () => {
    const server = api();
    renderWithAuth(<PartidoPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Fin de la parte" }));
    expect(within(screen.getByRole("dialog")).getByRole("status")).toHaveTextContent("00:00");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Aceptar" }));

    expect(await screen.findByText("Parte 1 terminada")).toBeInTheDocument();
    await waitFor(() => expect(posts(server)).toHaveLength(1));
    expect(posts(server)[0].lineup_events[0]).toMatchObject({
      seq: 2,
      payload: { type: "part_ended", t: 1200 },
    });
    expect(screen.getByRole("button", { name: "Empezar 2ª parte" })).toBeInTheDocument();
  });

  it("el descanso muestra el marcador y preselecciona a los que estaban en pista", async () => {
    events = [
      { id: "e1", seq: 1, kind: "goal", part: 1, t: 100, player_id: "p1", voids_event_id: null },
      { id: "e2", seq: 2, kind: "rival_goal", part: 1, t: 200, player_id: null, voids_event_id: null },
      { id: "e3", seq: 3, kind: "goal", part: 1, t: 300, player_id: "p2", voids_event_id: null },
    ];
    lineup = lineupOf(
      { type: "part_started", part: 1, starters: STARTERS },
      { type: "substituted", t: 600, player_out: "p1", player_in: "p7" },
      { type: "part_ended", t: 1200 },
    );
    api();

    renderWithAuth(<PartidoPage />);

    expect(await screen.findByText("Parte 1 terminada")).toBeInTheDocument();
    expect(screen.getByLabelText("Marcador")).toHaveTextContent("2 – 1");
    expect(screen.getByLabelText("Gema Ruiz")).toBeChecked();
    expect(screen.getByLabelText("Ana Ruiz")).not.toBeChecked();
    expect(screen.getByText("5 de 5 elegidos")).toBeInTheDocument();
  });

  it("no deja terminar la parte con un tiempo anterior al último cambio", async () => {
    lineup = lineupOf(
      { type: "part_started", part: 1, starters: STARTERS },
      { type: "substituted", t: 600, player_out: "p1", player_in: "p6" },
    );
    const server = api();
    renderWithAuth(<PartidoPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Fin de la parte" }));
    await typeTime("1500");

    expect(screen.getByRole("alert")).toHaveTextContent("anterior al último movimiento (10:00)");
    expect(posts(server)).toHaveLength(0);
  });

  it("empieza la 2ª parte y el reloj parte de cero, no del último tiempo de la 1ª", async () => {
    lineup = lineupOf(
      { type: "part_started", part: 1, starters: STARTERS },
      { type: "part_ended", t: 1200 },
    );
    const server = api();
    renderWithAuth(<PartidoPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Empezar 2ª parte" }));

    expect(await screen.findByText("Parte 2 en juego")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Marcador a 20:00/ })).toBeInTheDocument();
    await waitFor(() => expect(posts(server)).toHaveLength(1));
    expect(posts(server)[0].lineup_events[0]).toMatchObject({
      seq: 3,
      payload: { type: "part_started", part: 2, starters: STARTERS },
    });
  });

  it("tras una roja la 2ª parte se juega con 4 y el expulsado no se puede elegir", async () => {
    lineup = lineupOf(
      { type: "part_started", part: 1, starters: STARTERS },
      { type: "sent_off", t: 300, player_id: "p4" },
      { type: "part_ended", t: 1200 },
    );
    api();
    renderWithAuth(<PartidoPage />);

    expect(await screen.findByText("4 de 4 elegidos")).toBeInTheDocument();

    expect(screen.queryByLabelText("Dani Ruiz")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Empezar 2ª parte" })).toBeEnabled();
  });
});

describe("fin del partido", () => {
  const FULL = (): LineupEventRecord[] =>
    lineupOf(
      { type: "part_started", part: 1, starters: STARTERS },
      { type: "substituted", t: 300, player_out: "p1", player_in: "p6" },
      { type: "part_ended", t: 1200 },
      { type: "part_started", part: 2, starters: STARTERS },
      { type: "part_ended", t: 1200 },
    );

  it("al terminar la 2ª parte muestra el marcador final y los minutos de cada jugador", async () => {
    lineup = FULL();
    events = [{ id: "e1", seq: 1, kind: "goal", part: 1, t: 100, player_id: "p1", voids_event_id: null }];
    api();

    renderWithAuth(<PartidoPage />);

    expect(await screen.findByText("Partido terminado")).toBeInTheDocument();
    expect(screen.getByLabelText("Marcador")).toHaveTextContent("1 – 0");
    const minutes = screen.getByRole("list", { name: "Minutos jugados" });
    const row = (name: string) => within(minutes).getByText(name).closest("li") as HTMLElement;
    expect(within(row("Ana Ruiz")).getByText("25:00")).toBeInTheDocument();
    expect(within(row("Fran Ruiz")).getByText("15:00")).toBeInTheDocument();
    expect(within(row("Bea Ruiz")).getByText("40:00")).toBeInTheDocument();
    expect(within(minutes).queryByText("Gema Ruiz")).not.toBeInTheDocument();
  });

  it("cerrar el partido guarda los tramos en el servidor y lo indica", async () => {
    lineup = FULL();
    const server = api({
      "POST /matches/m1/finalize": { data: { stints: [], seconds_by_player: { p1: 1500 } } },
    });
    renderWithAuth(<PartidoPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Cerrar partido" }));

    expect(await screen.findByText("Partido cerrado")).toBeInTheDocument();
    expect(server.count("POST", "/matches/m1/finalize")).toBe(1);
    expect(screen.queryByRole("button", { name: "Cerrar partido" })).not.toBeInTheDocument();
  });

  it("una vez cerrado enlaza a las estadísticas y a la corrección de tramos", async () => {
    lineup = FULL();
    stints = [{ id: "t1", match_id: "m1", player_id: "p1", part: 1, start_s: 0, end_s: 300 }];
    api();
    renderWithAuth(<PartidoPage />);

    expect(await screen.findByRole("link", { name: "Ver estadísticas" })).toHaveAttribute(
      "href",
      "/estadisticas?id=m1",
    );
    expect(screen.getByRole("link", { name: "Corregir tramos" })).toHaveAttribute(
      "href",
      "/corregir?id=m1",
    );
  });

  it("si el partido ya estaba cerrado al cargar lo indica y deja rehacer el cierre", async () => {
    lineup = FULL();
    stints = [{ id: "t1", match_id: "m1", player_id: "p1", part: 1, start_s: 0, end_s: 300 }];
    const server = api({
      "POST /matches/m1/finalize": { data: { stints: [], seconds_by_player: {} } },
    });
    renderWithAuth(<PartidoPage />);

    expect(await screen.findByText("Partido cerrado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cerrar partido" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Rehacer cierre" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar rehacer cierre" }));

    await waitFor(() =>
      expect(server.calls.some((c) => c.path === "/matches/m1/finalize?force=true")).toBe(true),
    );
  });

  it("rehacer el cierre avisa de que borra las correcciones y se puede cancelar", async () => {
    lineup = FULL();
    stints = [{ id: "t1", match_id: "m1", player_id: "p1", part: 1, start_s: 0, end_s: 300 }];
    const server = api({
      "POST /matches/m1/finalize": { data: { stints: [], seconds_by_player: {} } },
    });
    renderWithAuth(<PartidoPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Rehacer cierre" }));

    expect(screen.getByText(/borra las correcciones de tramos hechas a mano/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.getByRole("button", { name: "Rehacer cierre" })).toBeInTheDocument();
    expect(server.calls.some((c) => c.path.startsWith("/matches/m1/finalize"))).toBe(false);
  });

  it("un doble toque en Rehacer cierre no confirma", async () => {
    lineup = FULL();
    stints = [{ id: "t1", match_id: "m1", player_id: "p1", part: 1, start_s: 0, end_s: 300 }];
    const server = api({
      "POST /matches/m1/finalize": { data: { stints: [], seconds_by_player: {} } },
    });
    renderWithAuth(<PartidoPage />);

    await userEvent.dblClick(await screen.findByRole("button", { name: "Rehacer cierre" }));

    expect(server.calls.some((c) => c.path.startsWith("/matches/m1/finalize"))).toBe(false);
    expect(screen.getByRole("button", { name: "Confirmar rehacer cierre" })).toBeInTheDocument();
  });

  it("si el servidor dice que ya está cerrado ofrece rehacer el cierre", async () => {
    lineup = FULL();
    const server = api({
      "POST /matches/m1/finalize": {
        status: 409,
        error: { code: "conflict", message: "El partido ya está cerrado; usa force para rehacerlo" },
      },
    });
    renderWithAuth(<PartidoPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Cerrar partido" }));

    expect(await screen.findByText("Partido cerrado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rehacer cierre" })).toBeInTheDocument();
    expect(server.count("POST", "/matches/m1/finalize")).toBe(1);
  });

  it("avisa si no se puede cerrar y deja volver a intentarlo", async () => {
    lineup = FULL();
    api({
      "POST /matches/m1/finalize": { status: 500, error: { code: "internal_error", message: "Fallo" } },
    });
    renderWithAuth(<PartidoPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Cerrar partido" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cerrar el partido");
    expect(screen.getByRole("button", { name: "Cerrar partido" })).toBeEnabled();
  });

  it("no deja cerrar mientras haya anotaciones sin enviar", async () => {
    lineup = lineupOf(
      { type: "part_started", part: 1, starters: STARTERS },
      { type: "part_ended", t: 1200 },
      { type: "part_started", part: 2, starters: STARTERS },
    );
    api();
    renderWithAuth(<PartidoPage />);
    await screen.findByRole("button", { name: "Fin de la parte" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await endPart();

    expect(await screen.findByText("Partido terminado")).toBeInTheDocument();
    expect(await screen.findByText(/Sin conexión · 1 sin enviar/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar partido" })).toBeDisabled();
    expect(screen.getByText(/Espera a que se envíen las anotaciones/)).toBeInTheDocument();
  });

  it("con menos jugadores disponibles que huecos deja empezar igualmente la 2ª parte", async () => {
    lineup = lineupOf(
      { type: "part_started", part: 1, starters: STARTERS },
      { type: "part_ended", t: 1200 },
    );
    const injured = (p: Player): Player => ({ ...p, status: p.id > "p3" ? "injured" : "available" });
    api({ "GET /players": { data: PLAYERS.map(injured) } });
    renderWithAuth(<PartidoPage />);

    expect(await screen.findByText("3 de 3 elegidos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Empezar 2ª parte" })).toBeEnabled();
  });

  it("propone para la 2ª parte a quien estaba en pista al terminar, aunque entrara justo al final", async () => {
    lineup = lineupOf(
      { type: "part_started", part: 1, starters: STARTERS },
      { type: "substituted", t: 1200, player_out: "p1", player_in: "p7" },
      { type: "part_ended", t: 1200 },
    );
    api();
    renderWithAuth(<PartidoPage />);

    expect(await screen.findByText("Parte 1 terminada")).toBeInTheDocument();

    expect(screen.getByLabelText("Gema Ruiz")).toBeChecked();
    expect(screen.getByLabelText("Ana Ruiz")).not.toBeChecked();
  });

  it("el resumen incluye los minutos de quien ya no está en la plantilla activa", async () => {
    lineup = lineupOf(
      { type: "part_started", part: 1, starters: ["p1", "p2", "p3", "p4", "p9"] },
      { type: "part_ended", t: 1200 },
      { type: "part_started", part: 2, starters: ["p1", "p2", "p3", "p4", "p9"] },
      { type: "part_ended", t: 1200 },
    );
    api();
    renderWithAuth(<PartidoPage />);

    const minutes = await screen.findByRole("list", { name: "Minutos jugados" });

    expect(within(minutes).getByText("Jugador desconocido")).toBeInTheDocument();
    expect(within(minutes).getAllByRole("listitem")).toHaveLength(5);
  });

  it("rehacer el cierre también espera a que no haya anotaciones sin enviar", async () => {
    lineup = lineupOf(
      { type: "part_started", part: 1, starters: STARTERS },
      { type: "part_ended", t: 1200 },
      { type: "part_started", part: 2, starters: STARTERS },
    );
    stints = [{ id: "t1", match_id: "m1", player_id: "p1", part: 1, start_s: 0, end_s: 300 }];
    api();
    renderWithAuth(<PartidoPage />);
    await screen.findByRole("button", { name: "Fin de la parte" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await endPart();

    expect(await screen.findByText("Partido cerrado")).toBeInTheDocument();
    await screen.findByText(/Sin conexión · 1 sin enviar/);
    expect(screen.getByRole("button", { name: "Rehacer cierre" })).toBeDisabled();
    expect(screen.getByText(/Espera a que se envíen las anotaciones/)).toBeInTheDocument();
  });
});
