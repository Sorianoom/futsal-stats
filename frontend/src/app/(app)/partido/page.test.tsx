import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LineupEventRecord, Match } from "@/lib/api/match-types";
import type { Callup, Player } from "@/lib/api/types";
import { mockApi, type MockHandler } from "@/test/mock-api";
import { fakeUser, renderWithAuth } from "@/test/render-with-auth";

import PartidoPage from "./page";

const navigation = vi.hoisted(() => ({ search: "", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ push: navigation.push, replace: vi.fn() }),
}));

const NAMES = ["Ana", "Bea", "Carla", "Dani", "Elena", "Fran"];
const PLAYERS: Player[] = NAMES.map((name, index) => ({
  id: `p${index + 1}`,
  name: `${name} Ruiz`,
  dorsal: index + 2,
  position: index === 5 ? "goalkeeper" : "field",
  status: "available",
  is_active: true,
}));
const MATCH: Match = { id: "m1", session_id: "s1", held_on: "2026-10-20", opponent: "Rival FS" };

let matches: Match[];
let lineup: LineupEventRecord[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T10:00:00Z"));
  navigation.search = "";
  navigation.push.mockClear();
  matches = [MATCH];
  lineup = [];
});

afterEach(() => {
  vi.useRealTimers();
});

const callup = (starters: string[]): Callup => ({
  week: "2026-10-19",
  ranking: [],
  field: { guaranteed: [], tied: [], open_slots: 0 },
  goalkeepers: { guaranteed: [], tied: [], open_slots: 0 },
  starters: { guaranteed: starters, tied: [], open_slots: 0 },
  breakdowns: {},
});

function api(extra: Record<string, MockHandler> = {}) {
  return mockApi({
    "GET /matches": () => ({ data: matches }),
    "GET /players": { data: PLAYERS },
    "GET /matches/m1/lineup-events": () => ({ data: lineup }),
    "GET /matches/m1/events": { data: [] },
    "GET /callup": () => ({ data: callup([]) }),
    ...extra,
  });
}

async function pick(names: string[]) {
  for (const name of names) await userEvent.click(screen.getByLabelText(`${name} Ruiz`));
}

describe("PartidoPage: lista de partidos", () => {
  it("lista los partidos con rival y fecha, enlazando a cada uno", async () => {
    api();

    renderWithAuth(<PartidoPage />);

    const link = await screen.findByRole("link", { name: /Rival FS/ });
    expect(link).toHaveAttribute("href", "/partido?id=m1");
    expect(link).toHaveTextContent("20 oct");
  });

  it("indica cuando todavía no hay partidos", async () => {
    matches = [];
    api();

    renderWithAuth(<PartidoPage />);

    expect(await screen.findByText("Todavía no hay partidos")).toBeInTheDocument();
  });

  it("avisa si no se pueden cargar y permite reintentar", async () => {
    api({ "GET /matches": { status: 500, error: { code: "internal_error", message: "Fallo" } } });

    renderWithAuth(<PartidoPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar los partidos");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("crea un partido con la fecha de hoy y abre su pantalla", async () => {
    const server = api({
      "POST /matches": () => ({ data: { ...MATCH, id: "m9", held_on: "2026-10-21", opponent: "Betis" } }),
    });
    renderWithAuth(<PartidoPage />);
    await screen.findByRole("link", { name: /Rival FS/ });
    await userEvent.click(screen.getByRole("button", { name: "Nuevo partido" }));
    const dialog = screen.getByRole("dialog");

    await userEvent.type(within(dialog).getByLabelText("Rival"), "  Betis ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crear" }));

    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/partido?id=m9"));
    expect(server.calls.find((c) => c.method === "POST")?.body).toEqual({
      held_on: "2026-10-21",
      opponent: "Betis",
    });
  });

  it("pide el rival antes de crear el partido", async () => {
    const server = api();
    renderWithAuth(<PartidoPage />);
    await screen.findByRole("link", { name: /Rival FS/ });
    await userEvent.click(screen.getByRole("button", { name: "Nuevo partido" }));
    const dialog = screen.getByRole("dialog");

    await userEvent.click(within(dialog).getByRole("button", { name: "Crear" }));

    expect(within(dialog).getByText("Indica el rival")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Rival")).toHaveAttribute("aria-invalid", "true");
    expect(server.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("también lo puede usar el segundo entrenador", async () => {
    api();

    renderWithAuth(<PartidoPage />, { user: fakeUser("assistant_coach") });

    expect(await screen.findByRole("link", { name: /Rival FS/ })).toBeInTheDocument();
  });
});

describe("PartidoPage: pantalla de un partido", () => {
  beforeEach(() => {
    navigation.search = "id=m1";
  });

  it("muestra el rival y no deja empezar sin los 5 iniciales", async () => {
    api();
    renderWithAuth(<PartidoPage />);

    expect(await screen.findByRole("heading", { name: /Rival FS/ })).toBeInTheDocument();
    await screen.findByLabelText("Ana Ruiz");
    await pick(["Ana", "Bea", "Carla", "Dani"]);

    expect(screen.getByRole("button", { name: "Empezar 1ª parte" })).toBeDisabled();
    expect(screen.getByText("4 de 5 elegidos")).toBeInTheDocument();
  });

  it("no deja elegir más de 5 iniciales", async () => {
    api();
    renderWithAuth(<PartidoPage />);
    await screen.findByLabelText("Ana Ruiz");

    await pick(["Ana", "Bea", "Carla", "Dani", "Elena"]);

    expect(screen.getByLabelText("Fran Ruiz")).toBeDisabled();
    expect(screen.getByLabelText("Ana Ruiz")).toBeEnabled();
  });

  it("propone como titulares los de la convocatoria", async () => {
    api({ "GET /callup": () => ({ data: callup(["p1", "p2", "p3", "p4"]) }) });
    renderWithAuth(<PartidoPage />);

    await waitFor(() => expect(screen.getByLabelText("Ana Ruiz")).toBeChecked());

    expect(screen.getByLabelText("Dani Ruiz")).toBeChecked();
    expect(screen.getByLabelText("Elena Ruiz")).not.toBeChecked();
    expect(screen.getByText("4 de 5 elegidos")).toBeInTheDocument();
  });

  it("funciona sin propuesta si la convocatoria no está disponible", async () => {
    api({ "GET /callup": { status: 403, error: { code: "forbidden", message: "No" } } });
    renderWithAuth(<PartidoPage />);

    await screen.findByLabelText("Ana Ruiz");

    expect(screen.getByLabelText("Ana Ruiz")).not.toBeChecked();
    expect(screen.getByText("0 de 5 elegidos")).toBeInTheDocument();
  });

  it("empieza la 1ª parte enviando los iniciales y muestra la pista", async () => {
    const server = api({
      "POST /matches/m1/sync": (request) => ({
        data: {
          accepted: [(request.body as { lineup_events: { id: string }[] }).lineup_events[0].id],
          duplicates: [],
          rejected: [],
        },
      }),
    });
    renderWithAuth(<PartidoPage />);
    await screen.findByLabelText("Ana Ruiz");
    await pick(["Ana", "Bea", "Carla", "Dani", "Fran"]);

    await userEvent.click(screen.getByRole("button", { name: "Empezar 1ª parte" }));

    expect(await screen.findByText("Parte 1 en juego")).toBeInTheDocument();
    const body = server.calls.find((c) => c.method === "POST")?.body as {
      lineup_events: { id: string; seq: number; payload: unknown }[];
    };
    expect(body.lineup_events).toHaveLength(1);
    expect(body.lineup_events[0].seq).toBe(1);
    expect(body.lineup_events[0].payload).toEqual({
      type: "part_started",
      part: 1,
      starters: ["p1", "p2", "p3", "p4", "p6"],
    });
    const court = screen.getByRole("list", { name: "En pista" });
    expect(within(court).getAllByRole("listitem")).toHaveLength(5);
    expect(within(court).getByText("Fran Ruiz")).toBeInTheDocument();
    const bench = screen.getByRole("list", { name: "Banquillo" });
    expect(within(bench).getByText("Elena Ruiz")).toBeInTheDocument();
  });

  it("reanuda el partido en juego tras recargar, sin pedir otra vez los iniciales", async () => {
    lineup = [
      {
        id: "l1",
        seq: 1,
        payload: { type: "part_started", part: 1, starters: ["p1", "p2", "p3", "p4", "p5"] },
      },
      { id: "l2", seq: 2, payload: { type: "substituted", t: 300, player_out: "p1", player_in: "p6" } },
    ];
    api();
    renderWithAuth(<PartidoPage />);

    expect(await screen.findByText("Parte 1 en juego")).toBeInTheDocument();

    const court = screen.getByRole("list", { name: "En pista" });
    expect(within(court).getByText("Fran Ruiz")).toBeInTheDocument();
    expect(within(court).queryByText("Ana Ruiz")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Empezar 1ª parte" })).not.toBeInTheDocument();
  });

  it("si el servidor rechaza empezar la parte avisa del conflicto y deja recargar", async () => {
    const server = api({
      "POST /matches/m1/sync": (request) => ({
        data: {
          accepted: [],
          duplicates: [],
          rejected: [
            {
              id: (request.body as { lineup_events: { id: string }[] }).lineup_events[0].id,
              reason: "seq_conflict",
            },
          ],
        },
      }),
    });
    renderWithAuth(<PartidoPage />);
    await screen.findByLabelText("Ana Ruiz");
    await pick(["Ana", "Bea", "Carla", "Dani", "Elena"]);

    await userEvent.click(screen.getByRole("button", { name: "Empezar 1ª parte" }));

    expect(await screen.findByText(/Conflicto con otro dispositivo/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Recargar partido" }));
    await waitFor(() => expect(server.count("GET", "/matches/m1/lineup-events")).toBe(2));
  });
  it("si se corta la red al empezar la parte sigue adelante y avisa de lo pendiente", async () => {
    api();
    renderWithAuth(<PartidoPage />);
    await screen.findByLabelText("Ana Ruiz");
    await pick(["Ana", "Bea", "Carla", "Dani", "Elena"]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await userEvent.click(screen.getByRole("button", { name: "Empezar 1ª parte" }));

    expect(await screen.findByText("Parte 1 en juego")).toBeInTheDocument();
    expect(await screen.findByText(/Sin conexión · 1 sin enviar/)).toBeInTheDocument();
  });
  it("avisa si el partido no existe", async () => {
    navigation.search = "id=desconocido";
    api({ "GET /matches/desconocido/lineup-events": { data: [] } });

    renderWithAuth(<PartidoPage />);

    expect(await screen.findByText("Partido no encontrado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a los partidos" })).toHaveAttribute(
      "href",
      "/partido",
    );
  });

  it("avisa si no se puede cargar el partido y permite reintentar", async () => {
    api({
      "GET /matches/m1/lineup-events": {
        status: 500,
        error: { code: "internal_error", message: "Fallo" },
      },
    });

    renderWithAuth(<PartidoPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar el partido");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("tras un corte de red reenvía la parte con el mismo id y seq para no duplicarla", async () => {
    const attempts: { id: string; seq: number }[] = [];
    api();
    renderWithAuth(<PartidoPage />);
    await screen.findByLabelText("Ana Ruiz");
    await pick(["Ana", "Bea", "Carla", "Dani", "Elena"]);
    const original = globalThis.fetch;
    let online = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as { lineup_events: { id: string; seq: number }[] };
          attempts.push(body.lineup_events[0]);
          if (!online) throw new TypeError("Failed to fetch");
          return new Response(
            JSON.stringify({
              success: true,
              data: { accepted: [], duplicates: [body.lineup_events[0].id], rejected: [] },
              error: null,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return original(input, init);
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Empezar 1ª parte" }));
    await screen.findByText(/Sin conexión/);
    online = true;

    await userEvent.click(screen.getByRole("button", { name: "Reintentar envío" }));

    expect(await screen.findByText("Sincronizado")).toBeInTheDocument();
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
  });
  it("si otro dispositivo ya cambió el partido, tras empezar se ofrece recargar", async () => {
    const server = api({
      "POST /matches/m1/sync": (request) => ({
        data: {
          accepted: [],
          duplicates: [],
          rejected: [
            {
              id: (request.body as { lineup_events: { id: string }[] }).lineup_events[0].id,
              reason: "id_conflict",
            },
          ],
        },
      }),
    });
    renderWithAuth(<PartidoPage />);
    await screen.findByLabelText("Ana Ruiz");
    await pick(["Ana", "Bea", "Carla", "Dani", "Elena"]);

    await userEvent.click(screen.getByRole("button", { name: "Empezar 1ª parte" }));
    await userEvent.click(await screen.findByRole("button", { name: "Recargar partido" }));

    await waitFor(() => expect(server.count("GET", "/matches/m1/events")).toBe(2));
  });
  it("recarga el partido al volver a la pestaña", async () => {
    const server = api();
    renderWithAuth(<PartidoPage />);
    await screen.findByLabelText("Ana Ruiz");

    await act(async () => {}); // vacía los efectos pendientes: el listener ya está puesto
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => expect(server.count("GET", "/matches/m1/lineup-events")).toBe(2));
  });

  it("solo manda una petición aunque se pulse dos veces Empezar", async () => {
    const server = api({
      "POST /matches/m1/sync": (request) => ({
        data: {
          accepted: [(request.body as { lineup_events: { id: string }[] }).lineup_events[0].id],
          duplicates: [],
          rejected: [],
        },
      }),
    });
    renderWithAuth(<PartidoPage />);
    await screen.findByLabelText("Ana Ruiz");
    await pick(["Ana", "Bea", "Carla", "Dani", "Elena"]);

    await userEvent.dblClick(screen.getByRole("button", { name: "Empezar 1ª parte" }));

    await screen.findByText("Parte 1 en juego");
    expect(server.calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("un id que el servidor no entiende se trata como partido no encontrado", async () => {
    navigation.search = "id=no-valido";
    api({
      "GET /matches/no-valido/lineup-events": {
        status: 422,
        error: { code: "validation_error", message: "Id no válido" },
      },
    });

    renderWithAuth(<PartidoPage />);

    expect(await screen.findByText("Partido no encontrado")).toBeInTheDocument();
  });

  it("con la 1ª parte terminada lo dice en vez de mostrar una pista vacía", async () => {
    lineup = [
      {
        id: "l1",
        seq: 1,
        payload: { type: "part_started", part: 1, starters: ["p1", "p2", "p3", "p4", "p5"] },
      },
      { id: "l2", seq: 2, payload: { type: "part_ended", t: 1200 } },
    ];
    api();

    renderWithAuth(<PartidoPage />);

    expect(await screen.findByText("Parte 1 terminada")).toBeInTheDocument();
  });

  it("ofrece recargar cuando la alineación guardada no es válida", async () => {
    lineup = [
      { id: "l1", seq: 1, payload: { type: "substituted", t: 10, player_out: "p1", player_in: "p2" } },
    ];
    const server = api();
    renderWithAuth(<PartidoPage />);
    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("button", { name: "Recargar" }));

    await waitFor(() => expect(server.count("GET", "/matches/m1/lineup-events")).toBe(2));
  });

  it("avisa si la alineación guardada es imposible en vez de romperse", async () => {
    lineup = [
      { id: "l1", seq: 1, payload: { type: "substituted", t: 10, player_out: "p1", player_in: "p2" } },
    ];
    api();

    renderWithAuth(<PartidoPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("La alineación guardada no es válida");
  });
});
