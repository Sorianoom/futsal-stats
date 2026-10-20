import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LineupEventRecord, LoggedEvent, Match } from "@/lib/api/match-types";
import type { Player } from "@/lib/api/types";
import { mockApi, type MockHandler } from "@/test/mock-api";
import { renderWithAuth } from "@/test/render-with-auth";

import PartidoPage from "./page";

const navigation = vi.hoisted(() => ({ search: "id=m1", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ push: navigation.push, replace: vi.fn() }),
}));

// En pista al empezar: Ana, Bea, Carla, Dani y Elena. En el banquillo: Fran y Gema.
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
const STARTED: LineupEventRecord = {
  id: "l1",
  seq: 1,
  payload: { type: "part_started", part: 1, starters: ["p1", "p2", "p3", "p4", "p5"] },
};

interface SyncBody {
  events: {
    id: string;
    seq: number;
    kind: string;
    part: number;
    t: number;
    player_id: string | null;
    voids_event_id: string | null;
  }[];
  lineup_events: { id: string; seq: number; payload: Record<string, unknown> }[];
  ratings: { part: number; t: number; stars: number }[];
}

let lineup: LineupEventRecord[];
let events: LoggedEvent[];

beforeEach(() => {
  navigation.search = "id=m1";
  window.localStorage.clear();
  lineup = [STARTED];
  events = [];
});

afterEach(() => {
  window.localStorage.clear();
});

const acceptAll: MockHandler = (request) => {
  const body = request.body as SyncBody;
  const accepted = [...body.events, ...body.lineup_events].map((item) => item.id);
  return { data: { accepted, duplicates: [], rejected: [] } };
};

function api(sync: MockHandler = acceptAll) {
  return mockApi({
    "GET /matches": { data: [MATCH] },
    "GET /players": { data: PLAYERS },
    "GET /matches/m1/lineup-events": () => ({ data: lineup }),
    "GET /matches/m1/events": () => ({ data: events }),
    "GET /callup": { data: { starters: { guaranteed: [] } } },
    "POST /matches/m1/sync": sync,
  });
}

const posts = (server: ReturnType<typeof mockApi>) =>
  server.calls.filter((c) => c.method === "POST").map((c) => c.body as SyncBody);

async function openBoard() {
  const court = await screen.findByRole("list", { name: "En pista" });
  return { court, bench: screen.getByRole("list", { name: "Banquillo" }) };
}

async function tapCourt(name: string) {
  const court = screen.getByRole("list", { name: "En pista" });
  await userEvent.click(within(court).getByRole("button", { name: new RegExp(name) }));
  return screen.getByRole("dialog");
}

async function typeTime(digits: string) {
  const keypad = screen.getByRole("dialog");
  for (const digit of digits) {
    await userEvent.click(within(keypad).getByRole("button", { name: digit }));
  }
  await userEvent.click(within(keypad).getByRole("button", { name: "Aceptar" }));
}

describe("panel en vivo", () => {
  it("muestra el marcador, la parte, las faltas de equipo y el reloj del marcador", async () => {
    api();
    renderWithAuth(<PartidoPage />);
    await openBoard();

    expect(screen.getByLabelText("Marcador")).toHaveTextContent("0 – 0");
    expect(screen.getByText("Parte 1 en juego")).toBeInTheDocument();
    expect(screen.getByText("Faltas de equipo: 0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Marcador a 20:00/ })).toBeInTheDocument();
  });

  it("anota un gol con el tiempo del marcador y sube el marcador al instante", async () => {
    const server = api();
    renderWithAuth(<PartidoPage />);
    await openBoard();

    const sheet = await tapCourt("Ana Ruiz");
    await userEvent.click(within(sheet).getByRole("button", { name: "Gol" }));
    await typeTime("1500");

    expect(screen.getByLabelText("Marcador")).toHaveTextContent("1 – 0");
    await waitFor(() => expect(posts(server)).toHaveLength(1));
    expect(posts(server)[0].events[0]).toMatchObject({
      kind: "goal",
      part: 1,
      t: 300,
      player_id: "p1",
      seq: 1,
    });
    expect(screen.getByRole("button", { name: /Marcador a 15:00/ })).toBeInTheDocument();
  });

  it("anota una falta con un solo toque usando el último tiempo y cuenta las de equipo", async () => {
    const server = api();
    renderWithAuth(<PartidoPage />);
    await openBoard();

    const sheet = await tapCourt("Bea Ruiz");
    await userEvent.click(within(sheet).getByRole("button", { name: "Falta" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Faltas de equipo: 1")).toBeInTheDocument();
    await waitFor(() => expect(posts(server)).toHaveLength(1));
    expect(posts(server)[0].events[0]).toMatchObject({ kind: "foul", player_id: "p2", t: 0 });
  });

  it.each([
    ["Asistencia", "assist"],
    ["Tiro", "shot"],
    ["Pérdida", "turnover"],
    ["Robo", "steal"],
    ["Amarilla", "yellow"],
  ])("%s se anota con un toque", async (label, kind) => {
    const server = api();
    renderWithAuth(<PartidoPage />);
    await openBoard();

    const sheet = await tapCourt("Carla Ruiz");
    await userEvent.click(within(sheet).getByRole("button", { name: label }));

    await waitFor(() => expect(posts(server)).toHaveLength(1));
    expect(posts(server)[0].events[0]).toMatchObject({ kind, player_id: "p3" });
  });

  it("hace un cambio desde un jugador de la pista, pidiendo el tiempo del marcador", async () => {
    const server = api();
    renderWithAuth(<PartidoPage />);
    const { court, bench } = await openBoard();

    const sheet = await tapCourt("Ana Ruiz");
    await userEvent.click(within(sheet).getByRole("button", { name: "Cambio" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Gema Ruiz/ }));
    await typeTime("1500");

    await waitFor(() => expect(within(court).getByText("Gema Ruiz")).toBeInTheDocument());
    expect(within(court).queryByText("Ana Ruiz")).not.toBeInTheDocument();
    expect(within(bench).getByText("Ana Ruiz")).toBeInTheDocument();
    await waitFor(() => expect(posts(server)).toHaveLength(1));
    expect(posts(server)[0].lineup_events[0]).toMatchObject({
      seq: 2,
      payload: { type: "substituted", t: 300, player_out: "p1", player_in: "p7" },
    });
  });

  it("hace un cambio desde el banquillo", async () => {
    const server = api();
    renderWithAuth(<PartidoPage />);
    const { bench } = await openBoard();

    await userEvent.click(within(bench).getByRole("button", { name: /Fran Ruiz/ }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Dani Ruiz/ }));
    await typeTime("1000");

    await waitFor(() => expect(posts(server)).toHaveLength(1));
    expect(posts(server)[0].lineup_events[0].payload).toMatchObject({
      type: "substituted",
      t: 600,
      player_out: "p4",
      player_in: "p6",
    });
  });

  it("no acepta un cambio con un tiempo anterior al último y no envía nada", async () => {
    const server = api();
    renderWithAuth(<PartidoPage />);
    await openBoard();
    const first = await tapCourt("Ana Ruiz");
    await userEvent.click(within(first).getByRole("button", { name: "Cambio" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Gema Ruiz/ }));
    await typeTime("1000");
    await waitFor(() => expect(posts(server)).toHaveLength(1));

    const second = await tapCourt("Bea Ruiz");
    await userEvent.click(within(second).getByRole("button", { name: "Cambio" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Fran Ruiz/ }));
    await typeTime("1500");

    expect(screen.getByRole("alert")).toHaveTextContent("anterior al último movimiento (10:00)");
    expect(posts(server)).toHaveLength(1);
  });

  it("una roja anota la tarjeta y la expulsión, y el jugador no vuelve al banquillo", async () => {
    const server = api();
    renderWithAuth(<PartidoPage />);
    const { court, bench } = await openBoard();

    const sheet = await tapCourt("Dani Ruiz");
    await userEvent.click(within(sheet).getByRole("button", { name: "Roja" }));
    await typeTime("1800");

    await waitFor(() => expect(posts(server)).toHaveLength(1));
    const body = posts(server)[0];
    expect(body.events[0]).toMatchObject({ kind: "red", player_id: "p4", t: 120 });
    expect(body.lineup_events[0].payload).toMatchObject({ type: "sent_off", t: 120, player_id: "p4" });
    expect(within(court).queryByText("Dani Ruiz")).not.toBeInTheDocument();
    expect(within(bench).queryByText("Dani Ruiz")).not.toBeInTheDocument();
  });

  it("anota un gol del rival sin jugador y lo suma al marcador", async () => {
    const server = api();
    renderWithAuth(<PartidoPage />);
    await openBoard();

    await userEvent.click(screen.getByRole("button", { name: "Gol rival" }));
    await typeTime("1700");

    expect(screen.getByLabelText("Marcador")).toHaveTextContent("0 – 1");
    await waitFor(() => expect(posts(server)).toHaveLength(1));
    expect(posts(server)[0].events[0]).toMatchObject({ kind: "rival_goal", player_id: null, t: 180 });
  });

  it("deshacer pide confirmación, dice qué se deshace y baja el marcador", async () => {
    const server = api();
    renderWithAuth(<PartidoPage />);
    await openBoard();
    const sheet = await tapCourt("Ana Ruiz");
    await userEvent.click(within(sheet).getByRole("button", { name: "Gol" }));
    await typeTime("1500");
    await waitFor(() => expect(posts(server)).toHaveLength(1));

    await userEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Gol de Ana Ruiz/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirmar" }));

    expect(screen.getByLabelText("Marcador")).toHaveTextContent("0 – 0");
    await waitFor(() => expect(posts(server)).toHaveLength(2));
    expect(posts(server)[1].events[0]).toMatchObject({
      kind: "undo",
      voids_event_id: posts(server)[0].events[0].id,
    });
  });

  it("deshacer está desactivado si no hay nada que deshacer", async () => {
    api();
    renderWithAuth(<PartidoPage />);
    await openBoard();

    expect(screen.getByRole("button", { name: "Deshacer" })).toBeDisabled();
  });

  it("valora el quinteto con estrellas en el último tiempo", async () => {
    const server = api();
    renderWithAuth(<PartidoPage />);
    await openBoard();

    await userEvent.click(screen.getByRole("button", { name: "Valorar quinteto" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "4 estrellas" }));

    await waitFor(() => expect(posts(server)).toHaveLength(1));
    expect(posts(server)[0].ratings[0]).toMatchObject({ part: 1, t: 0, stars: 4 });
  });

  it("carga los eventos ya guardados al recargar la pestaña", async () => {
    events = [
      { id: "e1", seq: 1, kind: "goal", part: 1, t: 100, player_id: "p1", voids_event_id: null },
      { id: "e2", seq: 2, kind: "rival_goal", part: 1, t: 200, player_id: null, voids_event_id: null },
      { id: "e3", seq: 3, kind: "goal", part: 1, t: 300, player_id: "p2", voids_event_id: null },
      { id: "e4", seq: 4, kind: "undo", part: 1, t: 300, player_id: null, voids_event_id: "e3" },
      { id: "e5", seq: 5, kind: "foul", part: 1, t: 310, player_id: "p3", voids_event_id: null },
    ];
    api();

    renderWithAuth(<PartidoPage />);
    await openBoard();

    expect(screen.getByLabelText("Marcador")).toHaveTextContent("1 – 1");
    expect(screen.getByText("Faltas de equipo: 1")).toBeInTheDocument();
  });

  it("sin red sigue anotando, avisa de lo pendiente y lo envía al volver", async () => {
    const server = api();
    renderWithAuth(<PartidoPage />);
    await openBoard();
    const original = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const sheet = await tapCourt("Ana Ruiz");
    await userEvent.click(within(sheet).getByRole("button", { name: "Falta" }));

    expect(await screen.findByText(/Sin conexión · 1 sin enviar/)).toBeInTheDocument();
    expect(screen.getByText("Faltas de equipo: 1")).toBeInTheDocument();
    vi.stubGlobal("fetch", original);
    await userEvent.click(screen.getByRole("button", { name: "Reintentar envío" }));

    expect(await screen.findByText("Sincronizado")).toBeInTheDocument();
    expect(posts(server)).toHaveLength(1);
  });

  it("si el servidor rechaza lo anotado avisa del conflicto y deja recargar", async () => {
    const server = api((request) => ({
      data: {
        accepted: [],
        duplicates: [],
        rejected: [{ id: (request.body as SyncBody).events[0].id, reason: "seq_conflict" }],
      },
    }));
    renderWithAuth(<PartidoPage />);
    await openBoard();

    const sheet = await tapCourt("Ana Ruiz");
    await userEvent.click(within(sheet).getByRole("button", { name: "Falta" }));

    expect(await screen.findByText(/Conflicto con otro dispositivo/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Recargar partido" }));
    await waitFor(() => expect(server.count("GET", "/matches/m1/events")).toBe(2));
  });

  it("el interruptor del marcador cambia a hacia arriba y se recuerda", async () => {
    api();
    renderWithAuth(<PartidoPage />);
    await openBoard();

    await userEvent.click(
      screen.getByRole("button", { name: "Marcador hacia abajo. Cambiar a hacia arriba" }),
    );

    expect(screen.getByRole("button", { name: /Marcador a 00:00/ })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("futsal:clock") ?? "{}")).toMatchObject({
      direction: "up",
    });
  });

  it("al tocar el tiempo del marcador se puede corregir sin anotar nada", async () => {
    const server = api();
    renderWithAuth(<PartidoPage />);
    await openBoard();

    await userEvent.click(screen.getByRole("button", { name: /Marcador a 20:00/ }));
    await typeTime("1000");

    expect(screen.getByRole("button", { name: /Marcador a 10:00/ })).toBeInTheDocument();
    expect(posts(server)).toHaveLength(0);
  });

  it("no acepta un gol con tiempo anterior al último cambio, para no atribuirlo al quinteto equivocado", async () => {
    const server = api();
    renderWithAuth(<PartidoPage />);
    await openBoard();
    const first = await tapCourt("Ana Ruiz");
    await userEvent.click(within(first).getByRole("button", { name: "Cambio" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Gema Ruiz/ }));
    await typeTime("1000");
    await waitFor(() => expect(posts(server)).toHaveLength(1));

    const second = await tapCourt("Bea Ruiz");
    await userEvent.click(within(second).getByRole("button", { name: "Gol" }));
    await typeTime("1500");

    expect(screen.getByRole("alert")).toHaveTextContent("anterior al último movimiento (10:00)");
    expect(screen.getByLabelText("Marcador")).toHaveTextContent("0 – 0");
    expect(posts(server)).toHaveLength(1);
  });

  it("una roja no se puede deshacer desde el panel y lo explica", async () => {
    const server = api();
    renderWithAuth(<PartidoPage />);
    await openBoard();
    const sheet = await tapCourt("Dani Ruiz");
    await userEvent.click(within(sheet).getByRole("button", { name: "Roja" }));
    await typeTime("1800");
    await waitFor(() => expect(posts(server)).toHaveLength(1));

    expect(screen.getByRole("button", { name: "Deshacer" })).toBeDisabled();
    expect(screen.getByText(/La roja no se puede deshacer/)).toBeInTheDocument();
  });

  it("tras un conflicto no deja anotar más hasta recargar", async () => {
    const server = api((request) => ({
      data: {
        accepted: [],
        duplicates: [],
        rejected: [{ id: (request.body as SyncBody).events[0].id, reason: "seq_conflict" }],
      },
    }));
    renderWithAuth(<PartidoPage />);
    await openBoard();
    const first = await tapCourt("Ana Ruiz");
    await userEvent.click(within(first).getByRole("button", { name: "Falta" }));
    await screen.findByText(/Conflicto con otro dispositivo/);

    const second = await tapCourt("Bea Ruiz");
    await userEvent.click(within(second).getByRole("button", { name: "Falta" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Recarga el partido antes de seguir");
    expect(screen.getByText("Faltas de equipo: 1")).toBeInTheDocument();
    expect(posts(server)).toHaveLength(1);
  });

  it("al cargar toma como último tiempo el del último evento guardado de la parte", async () => {
    events = [{ id: "e1", seq: 1, kind: "foul", part: 1, t: 300, player_id: "p3", voids_event_id: null }];
    api();

    renderWithAuth(<PartidoPage />);
    await openBoard();

    expect(screen.getByRole("button", { name: /Marcador a 15:00/ })).toBeInTheDocument();
  });

  it("avisa si el registro de eventos es incoherente en vez de mostrar un 0 – 0 falso", async () => {
    events = [
      { id: "e1", seq: 1, kind: "undo", part: 1, t: 10, player_id: null, voids_event_id: "no-existe" },
    ];
    api();

    renderWithAuth(<PartidoPage />);
    await openBoard();

    expect(screen.getByRole("alert")).toHaveTextContent("El registro de eventos no es coherente");
  });

  it("una recarga lenta no descarta lo que se anota mientras llega", async () => {
    const server = api();
    renderWithAuth(<PartidoPage />);
    await openBoard();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const original = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes("lineup-events") && (init?.method ?? "GET") === "GET") await gate;
        return original(input, init);
      }),
    );

    document.dispatchEvent(new Event("visibilitychange"));
    const sheet = await tapCourt("Ana Ruiz");
    await userEvent.click(within(sheet).getByRole("button", { name: "Falta" }));
    expect(screen.getByText("Faltas de equipo: 1")).toBeInTheDocument();
    release();

    await waitFor(() => expect(server.count("GET", "/matches/m1/lineup-events")).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByText("Faltas de equipo: 1")).toBeInTheDocument();
  });

  it("avisa al cerrar la pestaña si hay anotaciones sin enviar y no si todo está enviado", async () => {
    api();
    renderWithAuth(<PartidoPage />);
    await openBoard();
    const quiet = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(quiet);
    expect(quiet.defaultPrevented).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const sheet = await tapCourt("Ana Ruiz");
    await userEvent.click(within(sheet).getByRole("button", { name: "Falta" }));
    await screen.findByText(/Sin conexión · 1 sin enviar/);

    const risky = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(risky);

    expect(risky.defaultPrevented).toBe(true);
  });

  it("pide confirmar antes de salir a la lista de partidos con anotaciones sin enviar", async () => {
    api();
    renderWithAuth(<PartidoPage />);
    await openBoard();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const sheet = await tapCourt("Ana Ruiz");
    await userEvent.click(within(sheet).getByRole("button", { name: "Falta" }));
    await screen.findByText(/Sin conexión · 1 sin enviar/);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    const link = screen.getByRole("link", { name: "Todos los partidos" });
    const proceeded = fireEvent.click(link);

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(proceeded).toBe(false);
    confirm.mockRestore();
  });
});
