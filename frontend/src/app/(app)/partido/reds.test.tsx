import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LineupEventRecord, LoggedEvent, Match } from "@/lib/api/match-types";
import type { Infraction, Movement, Player } from "@/lib/api/types";
import { mockApi, type MockHandler } from "@/test/mock-api";
import { renderWithAuth } from "@/test/render-with-auth";

import PartidoPage from "./page";

const navigation = vi.hoisted(() => ({ search: "id=m1", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ push: navigation.push, replace: vi.fn() }),
}));

const NAMES = ["Ana", "Bea", "Carla", "Dani", "Elena", "Fran"];
const PLAYERS: Player[] = NAMES.map((name, index) => ({
  id: `p${index + 1}`,
  name: `${name} Ruiz`,
  dorsal: index + 2,
  position: "field",
  status: "available",
  is_active: true,
}));
const MATCH: Match = { id: "m1", session_id: "s1", held_on: "2026-10-20", opponent: "Rival FS" };
const NEXT_MATCH: Match = { id: "m2", session_id: "s2", held_on: "2026-10-27", opponent: "Betis" };
const OLD_MATCH: Match = { id: "m0", session_id: "s0", held_on: "2026-10-13", opponent: "Cádiz" };

const STARTERS = ["p1", "p2", "p3", "p4", "p5"];
const FINISHED: LineupEventRecord["payload"][] = [
  { type: "part_started", part: 1, starters: STARTERS },
  { type: "sent_off", t: 300, player_id: "p4" },
  { type: "part_ended", t: 1200 },
  { type: "part_started", part: 2, starters: ["p1", "p2", "p3", "p5"] },
  { type: "part_ended", t: 1200 },
];
const RED: LoggedEvent = {
  id: "e1",
  seq: 1,
  kind: "red",
  part: 1,
  t: 300,
  player_id: "p4",
  voids_event_id: null,
};

const CATALOG_O: Infraction = {
  code: "o",
  severity: "very_serious",
  points: -10,
  description: "Roja en un partido que perjudique al equipo",
  deferral: "next_week",
  sanction: { kind: "no_play", min_matches: 1, max_matches: 1 },
  in_pdf_letter: true,
};

let events: LoggedEvent[];
let matches: Match[];
let movements: Movement[];
let exclusions: { id: string; player_id: string; match_id: string; kind: string }[];

beforeEach(() => {
  navigation.search = "id=m1";
  window.localStorage.clear();
  events = [RED];
  matches = [MATCH, NEXT_MATCH, OLD_MATCH];
  movements = [];
  exclusions = [];
});

afterEach(() => window.localStorage.clear());

function api(extra: Record<string, MockHandler> = {}) {
  return mockApi({
    "GET /matches": () => ({ data: matches }),
    "GET /players": { data: PLAYERS },
    "GET /matches/m1/lineup-events": () => ({
      data: FINISHED.map((payload, index) => ({ id: `l${index + 1}`, seq: index + 1, payload })),
    }),
    "GET /matches/m1/events": () => ({ data: events }),
    "GET /matches/m1/stints": { data: [] },
    "GET /callup": { data: { starters: { guaranteed: [] } } },
    "GET /catalog/infractions": { data: [CATALOG_O] },
    "GET /movements": (request) => {
      const week = new URL(request.path, "http://x").searchParams.get("week");
      return { data: movements.filter((m) => m.applies_week === week) };
    },
    "GET /exclusions": (request) => {
      const matchId = new URL(request.path, "http://x").searchParams.get("match_id");
      return { data: exclusions.filter((x) => x.match_id === matchId) };
    },
    ...extra,
  });
}

const registered = { data: { movement: { id: "m9" }, escalations: [], sanction: null } };

async function redsSection() {
  return within(await screen.findByRole("region", { name: "Rojas del partido" }));
}

describe("rojas en el resumen del partido", () => {
  it("lista las rojas del partido con la falta «o» que se podría registrar", async () => {
    api();
    renderWithAuth(<PartidoPage />);

    const reds = await redsSection();

    expect(reds.getByText("Roja de Dani Ruiz")).toBeInTheDocument();
    expect(await reds.findByText(/Roja en un partido que perjudique al equipo \(-10\)/)).toBeInTheDocument();
  });

  it("no muestra la sección si no hubo rojas o si se deshicieron", async () => {
    events = [RED, { ...RED, id: "e2", seq: 2, kind: "undo", player_id: null, voids_event_id: "e1" }];
    api();
    renderWithAuth(<PartidoPage />);
    await screen.findByText("Partido terminado");

    expect(screen.queryByRole("region", { name: "Rojas del partido" })).not.toBeInTheDocument();
  });

  it("registra la falta «o» como falta en partido de la sesión del partido", async () => {
    const server = api({ "POST /movements/infractions": registered });
    renderWithAuth(<PartidoPage />);
    const reds = await redsSection();

    await userEvent.click(await reds.findByRole("button", { name: "Registrar falta «o» a Dani Ruiz" }));

    expect(await reds.findByText("Falta «o» registrada")).toBeInTheDocument();
    expect(server.calls.find((c) => c.path === "/movements/infractions")?.body).toEqual({
      player_id: "p4",
      infraction_code: "o",
      occurred_on: "2026-10-20",
      in_match: true,
      session_id: "s1",
    });
    expect(reds.queryByRole("button", { name: "Registrar falta «o» a Dani Ruiz" })).not.toBeInTheDocument();
  });

  it("si la falta ya constaba lo indica y no deja registrarla otra vez", async () => {
    movements = [
      {
        id: "m5",
        player_id: "p4",
        occurred_on: "2026-10-20",
        points: -10,
        reason: "Roja en un partido que perjudique al equipo",
        applies_week: "2026-10-26",
        session_id: "s1",
        infraction_code: "o",
      },
    ];
    api();
    renderWithAuth(<PartidoPage />);
    const reds = await redsSection();

    expect(await reds.findByText("Falta «o» ya registrada")).toBeInTheDocument();
    expect(reds.queryByRole("button", { name: /Registrar falta «o»/ })).not.toBeInTheDocument();
  });

  it("si se corta la red al registrar avisa de que puede haberse registrado", async () => {
    api();
    renderWithAuth(<PartidoPage />);
    const reds = await redsSection();
    const button = await reds.findByRole("button", { name: "Registrar falta «o» a Dani Ruiz" });
    const original = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") throw new TypeError("Failed to fetch");
        return original(input, init);
      }),
    );

    await userEvent.click(button);

    expect(await reds.findByRole("alert")).toHaveTextContent(
      "Puede que la falta se haya registrado. Revisa Puntos antes de volver a intentarlo",
    );
  });

  it("propone la sanción del catálogo y la confirma en el partido siguiente elegido", async () => {
    const server = api({
      "POST /exclusions": () => ({
        data: { id: "x1", player_id: "p4", match_id: "m2", kind: "no_play" },
      }),
    });
    renderWithAuth(<PartidoPage />);
    const reds = await redsSection();

    expect(await reds.findByText("Sanción propuesta: No juega (1 partido)")).toBeInTheDocument();
    const options = within(reds.getByLabelText("Partido de la exclusión de Dani Ruiz")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Selecciona el partido", "27 oct · Betis"]);
    await userEvent.selectOptions(reds.getByLabelText("Partido de la exclusión de Dani Ruiz"), "m2");
    await userEvent.click(reds.getByRole("button", { name: "Confirmar exclusión de Dani Ruiz" }));

    expect(await reds.findByText("Exclusión confirmada: No juega en Betis")).toBeInTheDocument();
    expect(server.calls.find((c) => c.path === "/exclusions")?.body).toEqual({
      player_id: "p4",
      match_id: "m2",
      kind: "no_play",
    });
  });

  it("preselecciona el primer partido siguiente y pide elegir si se quita", async () => {
    const server = api();
    renderWithAuth(<PartidoPage />);
    const reds = await redsSection();
    const select = await reds.findByLabelText("Partido de la exclusión de Dani Ruiz");
    expect(select).toHaveValue("m2");

    await userEvent.selectOptions(select, "");
    await userEvent.click(reds.getByRole("button", { name: "Confirmar exclusión de Dani Ruiz" }));

    expect(reds.getByText("Elige el partido")).toBeInTheDocument();
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(server.calls.some((c) => c.path === "/exclusions" && c.method === "POST")).toBe(false);
  });

  it("si todavía no hay un partido siguiente lo explica", async () => {
    matches = [MATCH, OLD_MATCH];
    api();
    renderWithAuth(<PartidoPage />);
    const reds = await redsSection();

    expect(await reds.findByText(/Todavía no hay un partido siguiente/)).toBeInTheDocument();
    expect(reds.queryByRole("button", { name: /Confirmar exclusión/ })).not.toBeInTheDocument();
  });

  it("si el jugador ya tenía esa exclusión la da por confirmada", async () => {
    api({
      "POST /exclusions": {
        status: 409,
        error: { code: "conflict", message: "El jugador ya tiene esa exclusión" },
      },
    });
    renderWithAuth(<PartidoPage />);
    const reds = await redsSection();
    await userEvent.selectOptions(await reds.findByLabelText("Partido de la exclusión de Dani Ruiz"), "m2");

    await userEvent.click(reds.getByRole("button", { name: "Confirmar exclusión de Dani Ruiz" }));

    expect(await reds.findByText("Exclusión confirmada: No juega en Betis")).toBeInTheDocument();
  });

  it("avisa si no se puede confirmar la exclusión", async () => {
    api({
      "POST /exclusions": { status: 500, error: { code: "internal_error", message: "Fallo" } },
    });
    renderWithAuth(<PartidoPage />);
    const reds = await redsSection();
    await userEvent.selectOptions(await reds.findByLabelText("Partido de la exclusión de Dani Ruiz"), "m2");

    await userEvent.click(reds.getByRole("button", { name: "Confirmar exclusión de Dani Ruiz" }));

    expect(await reds.findByRole("alert")).toHaveTextContent("No se pudo confirmar la exclusión");
  });

  it("si no se puede cargar el catálogo avisa pero sigue mostrando las rojas", async () => {
    api({
      "GET /catalog/infractions": { status: 500, error: { code: "internal_error", message: "Fallo" } },
    });
    renderWithAuth(<PartidoPage />);
    const reds = await redsSection();

    expect(await reds.findByRole("alert")).toHaveTextContent("No se pudo cargar la falta «o»");
    expect(reds.getByText("Roja de Dani Ruiz")).toBeInTheDocument();
    await waitFor(() =>
      expect(reds.queryByRole("button", { name: /Registrar falta «o»/ })).not.toBeInTheDocument(),
    );
  });

  it("tras un fallo de red no deja volver a registrar a ciegas: obliga a comprobar primero", async () => {
    const server = api();
    renderWithAuth(<PartidoPage />);
    const reds = await redsSection();
    const register = await reds.findByRole("button", { name: "Registrar falta «o» a Dani Ruiz" });
    const original = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") throw new TypeError("Failed to fetch");
        return original(input, init);
      }),
    );
    await userEvent.click(register);
    await reds.findByRole("alert");

    expect(reds.queryByRole("button", { name: "Registrar falta «o» a Dani Ruiz" })).not.toBeInTheDocument();
    vi.stubGlobal("fetch", original);
    await userEvent.click(reds.getByRole("button", { name: "Comprobar falta «o» de Dani Ruiz" }));

    // No llegó: tras comprobarlo se puede registrar.
    expect(await reds.findByRole("button", { name: "Registrar falta «o» a Dani Ruiz" })).toBeInTheDocument();
    expect(server.calls.filter((c) => c.path === "/movements/infractions")).toHaveLength(0);
  });

  it("tras comprobar y reintentar, la falta «o» se manda con la misma clave de idempotencia", async () => {
    const keys: (string | null)[] = [];
    api({ "POST /movements/infractions": registered });
    renderWithAuth(<PartidoPage />);
    const reds = await redsSection();
    const register = await reds.findByRole("button", { name: "Registrar falta «o» a Dani Ruiz" });
    const original = globalThis.fetch;
    let failed = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          keys.push(new Headers(init.headers).get("Idempotency-Key"));
          if (!failed) {
            failed = true;
            throw new TypeError("Failed to fetch");
          }
        }
        return original(input, init);
      }),
    );
    await userEvent.click(register);
    await userEvent.click(await reds.findByRole("button", { name: "Comprobar falta «o» de Dani Ruiz" }));

    await userEvent.click(await reds.findByRole("button", { name: "Registrar falta «o» a Dani Ruiz" }));

    expect(await reds.findByText("Falta «o» registrada")).toBeInTheDocument();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[0]).toBeTruthy();
  });

  it("si al comprobar resulta que la falta sí llegó al servidor la da por registrada", async () => {
    api();
    renderWithAuth(<PartidoPage />);
    const reds = await redsSection();
    const register = await reds.findByRole("button", { name: "Registrar falta «o» a Dani Ruiz" });
    const original = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") throw new TypeError("Failed to fetch");
        return original(input, init);
      }),
    );
    await userEvent.click(register);
    await reds.findByRole("alert");
    movements = [
      {
        id: "m7",
        player_id: "p4",
        occurred_on: "2026-10-20",
        points: -10,
        reason: "Roja",
        applies_week: "2026-10-26",
        session_id: "s1",
        infraction_code: "o",
      },
    ];
    vi.stubGlobal("fetch", original);

    await userEvent.click(reds.getByRole("button", { name: "Comprobar falta «o» de Dani Ruiz" }));

    expect(await reds.findByText("Falta «o» ya registrada")).toBeInTheDocument();
    expect(reds.queryByRole("button", { name: /Registrar falta «o»/ })).not.toBeInTheDocument();
  });

  it("un error 5xx se trata como incierto, igual que un corte de red", async () => {
    api({
      "POST /movements/infractions": { status: 500, error: { code: "internal_error", message: "Fallo" } },
    });
    renderWithAuth(<PartidoPage />);
    const reds = await redsSection();

    await userEvent.click(await reds.findByRole("button", { name: "Registrar falta «o» a Dani Ruiz" }));

    expect(await reds.findByRole("button", { name: "Comprobar falta «o» de Dani Ruiz" })).toBeInTheDocument();
    expect(reds.queryByRole("button", { name: "Registrar falta «o» a Dani Ruiz" })).not.toBeInTheDocument();
  });

  it("un rechazo claro del servidor (4xx) deja volver a intentarlo", async () => {
    api({
      "POST /movements/infractions": {
        status: 404,
        error: { code: "not_found", message: "Jugador no encontrado" },
      },
    });
    renderWithAuth(<PartidoPage />);
    const reds = await redsSection();

    await userEvent.click(await reds.findByRole("button", { name: "Registrar falta «o» a Dani Ruiz" }));

    expect(await reds.findByRole("alert")).toHaveTextContent("No se pudo registrar la falta");
    expect(reds.getByRole("button", { name: "Registrar falta «o» a Dani Ruiz" })).toBeEnabled();
  });

  it("un doble toque en Registrar solo envía una falta", async () => {
    const server = api({ "POST /movements/infractions": registered });
    renderWithAuth(<PartidoPage />);
    const reds = await redsSection();

    await userEvent.dblClick(await reds.findByRole("button", { name: "Registrar falta «o» a Dani Ruiz" }));

    await reds.findByText("Falta «o» registrada");
    expect(server.calls.filter((c) => c.path === "/movements/infractions")).toHaveLength(1);
  });

  it("no cuenta como registrada la falta de otro jugador, de otra sesión o de otro tipo", async () => {
    const base = {
      occurred_on: "2026-10-20",
      points: -10,
      reason: "x",
      applies_week: "2026-10-19",
    };
    movements = [
      { ...base, id: "a", player_id: "p1", session_id: "s1", infraction_code: "o" },
      { ...base, id: "b", player_id: "p4", session_id: "otra", infraction_code: "o" },
      { ...base, id: "c", player_id: "p4", session_id: "s1", infraction_code: "L-a" },
    ];
    api();
    renderWithAuth(<PartidoPage />);
    const reds = await redsSection();

    expect(await reds.findByRole("button", { name: "Registrar falta «o» a Dani Ruiz" })).toBeEnabled();
    expect(reds.queryByText("Falta «o» ya registrada")).not.toBeInTheDocument();
  });

  it("si no se pueden cargar los partidos no dice que no hay siguiente y deja reintentar", async () => {
    let fail = true;
    api({
      "GET /matches": () =>
        fail
          ? { status: 500, error: { code: "internal_error", message: "Fallo" } }
          : { data: matches },
    });
    renderWithAuth(<PartidoPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No se pudo cargar el partido");
    fail = false;
    await userEvent.click(within(alert).getByRole("button", { name: "Reintentar" }));

    const reds = await redsSection();
    expect(await reds.findByText("Sanción propuesta: No juega (1 partido)")).toBeInTheDocument();
  });

  it("al recargar muestra las exclusiones que ya estaban confirmadas", async () => {
    exclusions = [{ id: "x1", player_id: "p4", match_id: "m2", kind: "no_play" }];
    api();
    renderWithAuth(<PartidoPage />);
    const reds = await redsSection();

    expect(await reds.findByText("Exclusión confirmada: No juega en Betis")).toBeInTheDocument();
    expect(reds.getByText(/La sanción propuesta ya está completa/)).toBeInTheDocument();
    expect(reds.queryByRole("button", { name: /Confirmar exclusión/ })).not.toBeInTheDocument();
  });

  it("con una sanción de 1 a 2 partidos deja confirmar dos y ya no ofrece más", async () => {
    const range = { ...CATALOG_O, sanction: { kind: "no_play", min_matches: 1, max_matches: 2 } };
    matches = [MATCH, NEXT_MATCH, { ...NEXT_MATCH, id: "m3", held_on: "2026-11-03", opponent: "Cádiz B" }];
    const server = api({
      "GET /catalog/infractions": { data: [range] },
      "POST /exclusions": (request) => ({
        data: { id: "x", ...(request.body as object) },
      }),
    });
    renderWithAuth(<PartidoPage />);
    const reds = await redsSection();
    const select = await reds.findByLabelText("Partido de la exclusión de Dani Ruiz");
    expect(select).toHaveValue("m2");

    await userEvent.click(reds.getByRole("button", { name: "Confirmar exclusión de Dani Ruiz" }));
    await reds.findByText("Exclusión confirmada: No juega en Betis");
    expect(reds.getByLabelText("Partido de la exclusión de Dani Ruiz")).toHaveValue("m3");
    await userEvent.click(reds.getByRole("button", { name: "Confirmar exclusión de Dani Ruiz" }));

    expect(await reds.findByText("Exclusión confirmada: No juega en Cádiz B")).toBeInTheDocument();
    expect(reds.queryByRole("button", { name: /Confirmar exclusión/ })).not.toBeInTheDocument();
    expect(server.calls.filter((c) => c.path === "/exclusions" && c.method === "POST")).toHaveLength(2);
  });

  it("un partido de la misma fecha no cuenta como siguiente", async () => {
    matches = [MATCH, { ...NEXT_MATCH, id: "m8", held_on: "2026-10-20", opponent: "Mismo día" }];
    api();
    renderWithAuth(<PartidoPage />);
    const reds = await redsSection();

    expect(await reds.findByText(/Todavía no hay un partido siguiente/)).toBeInTheDocument();
  });
});
