import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LineupEventRecord, Match } from "@/lib/api/match-types";
import type { Player } from "@/lib/api/types";
import { loadSnapshot, saveSnapshot } from "@/lib/match/match-cache";
import { mockApi, type MockHandler } from "@/test/mock-api";
import { renderWithAuth } from "@/test/render-with-auth";

import PartidoPage from "./page";

const navigation = vi.hoisted(() => ({ search: "id=m1", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ push: navigation.push, replace: vi.fn() }),
}));

const PLAYERS: Player[] = ["Ana", "Bea", "Carla", "Dani", "Elena", "Fran", "Gema"].map(
  (name, index) => ({
    id: `p${index + 1}`,
    name: `${name} Ruiz`,
    dorsal: index + 2,
    position: index === 5 ? "goalkeeper" : "field",
    status: "available",
    is_active: true, has_account: false,
  }),
);
const MATCH: Match = { id: "m1", session_id: "s1", held_on: "2026-10-20", opponent: "Rival FS", is_official: true };
const STARTED: LineupEventRecord = {
  id: "l1",
  seq: 1,
  payload: { type: "part_started", part: 1, starters: ["p1", "p2", "p3", "p4", "p5"] },
};
const FIVE_MINUTES_MS = 5 * 60_000;

interface SyncBody {
  events: { id: string }[];
  lineup_events: { id: string }[];
  ratings: { id: string }[];
}

beforeEach(() => {
  navigation.search = "id=m1";
  window.localStorage.clear();
});

const acceptAll: MockHandler = (request) => {
  const body = request.body as SyncBody;
  const accepted = [...body.events, ...body.lineup_events, ...body.ratings].map((item) => item.id);
  return { data: { accepted, duplicates: [], rejected: [] } };
};

function api(matches: Match[] = [MATCH]) {
  return mockApi({
    "GET /matches": { data: matches },
    "GET /players": { data: PLAYERS },
    "GET /matches/m1/lineup-events": { data: [STARTED] },
    "GET /matches/m1/events": { data: [] },
    "GET /callup": { data: { starters: { guaranteed: [] } } },
    "POST /matches/m1/sync": acceptAll,
  });
}

function cutNetwork() {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
}

function saveCopy(savedAt: number = Date.now() - FIVE_MINUTES_MS) {
  return saveSnapshot(
    "m1",
    { match: MATCH, lineup: [STARTED], events: [], stints: [], players: PLAYERS, proposed: [] },
    savedAt,
  );
}

describe("partido: copia local de los datos", () => {
  it("guarda una copia al cargar el partido", async () => {
    api();

    renderWithAuth(<PartidoPage />);
    await screen.findByRole("list", { name: "En pista" });

    await waitFor(async () => expect(await loadSnapshot("m1")).not.toBeNull());
    const copy = await loadSnapshot("m1");
    expect(copy?.match).toEqual(MATCH);
    expect(copy?.lineup).toEqual([STARTED]);
    expect(copy?.players).toHaveLength(PLAYERS.length);
  });

  it("actualiza la copia con lo que el servidor confirma después", async () => {
    api();
    renderWithAuth(<PartidoPage />);
    await screen.findByRole("list", { name: "En pista" });

    await userEvent.click(screen.getByRole("button", { name: "Gol rival" }));

    await waitFor(async () => {
      const copy = await loadSnapshot("m1");
      expect(copy?.events.map((event) => event.kind)).toEqual(["rival_goal"]);
    });
  });

  it("sin red abre el partido con la copia y avisa de su antigüedad", async () => {
    await saveCopy();
    cutNetwork();

    renderWithAuth(<PartidoPage />);

    expect(await screen.findByRole("list", { name: "En pista" })).toBeInTheDocument();
    expect(screen.getByText(/Sin conexión: datos de hace 5 min/)).toBeInTheDocument();
  });

  it("sin red y sin copia no se puede abrir el partido", async () => {
    cutNetwork();

    renderWithAuth(<PartidoPage />);

    expect(await screen.findByText("No se pudo cargar el partido")).toBeInTheDocument();
  });

  it("si el servidor dice que el partido no existe, no se usa la copia", async () => {
    await saveCopy();
    api([]);

    renderWithAuth(<PartidoPage />);

    expect(await screen.findByText("Partido no encontrado")).toBeInTheDocument();
  });

  it("al recuperar la red, actualizar sustituye la copia por los datos del servidor", async () => {
    await saveCopy();
    cutNetwork();
    renderWithAuth(<PartidoPage />);
    await screen.findByText(/Sin conexión: datos de hace/);

    api();
    await userEvent.click(screen.getByRole("button", { name: "Actualizar" }));

    await waitFor(() => expect(screen.queryByText(/Sin conexión: datos de hace/)).not.toBeInTheDocument());
    expect(screen.getByRole("list", { name: "En pista" })).toBeInTheDocument();
  });

  it("si sigue sin red, actualizar deja el tablero como está y avisa", async () => {
    await saveCopy();
    cutNetwork();
    renderWithAuth(<PartidoPage />);
    await screen.findByText(/Sin conexión: datos de hace/);

    await userEvent.click(screen.getByRole("button", { name: "Actualizar" }));

    expect(await screen.findByText("No se pudo actualizar el partido")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "En pista" })).toBeInTheDocument();
    expect(screen.getByText(/Sin conexión: datos de hace/)).toBeInTheDocument();
  });
});
