import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LineupEventRecord, LoggedEvent, Match } from "@/lib/api/match-types";
import type { Player } from "@/lib/api/types";
import { EMPTY_OUTBOX } from "@/lib/match/outbox";
import { loadOutbox, saveOutbox } from "@/lib/match/outbox-store";
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
const SAVED_FOUL = { id: "e9", seq: 1, kind: "foul" as const, part: 1, t: 90, player_id: "p1" };

interface SyncBody {
  events: { id: string }[];
  lineup_events: { id: string }[];
  ratings: { id: string }[];
}

let events: LoggedEvent[];

beforeEach(() => {
  navigation.search = "id=m1";
  window.localStorage.clear();
  events = [];
});

const acceptAll: MockHandler = (request) => {
  const body = request.body as SyncBody;
  const accepted = [...body.events, ...body.lineup_events, ...body.ratings].map((item) => item.id);
  return { data: { accepted, duplicates: [], rejected: [] } };
};

function api() {
  return mockApi({
    "GET /matches": { data: [MATCH] },
    "GET /players": { data: PLAYERS },
    "GET /matches/m1/lineup-events": { data: [STARTED] },
    "GET /matches/m1/events": () => ({ data: events }),
    "GET /callup": { data: { starters: { guaranteed: [] } } },
    "POST /matches/m1/sync": acceptAll,
  });
}

describe("partido: lo anotado sin enviar sobrevive a cerrar la pestaña", () => {
  it("al reabrir el partido reenvía lo que quedó guardado", async () => {
    await saveOutbox("m1", { ...EMPTY_OUTBOX, events: [SAVED_FOUL] });
    const server = api();

    renderWithAuth(<PartidoPage />);
    await screen.findByRole("list", { name: "En pista" });

    await waitFor(() => expect(server.count("POST", "/matches/m1/sync")).toBe(1));
    const sent = server.calls.find((call) => call.method === "POST")?.body as SyncBody;
    expect(sent.events.map((event) => event.id)).toEqual(["e9"]);
    await waitFor(async () => expect(await loadOutbox("m1")).toEqual(EMPTY_OUTBOX));
  });

  it("no reenvía lo guardado que el servidor ya había recibido", async () => {
    await saveOutbox("m1", { ...EMPTY_OUTBOX, events: [SAVED_FOUL] });
    events = [{ ...SAVED_FOUL, voids_event_id: null }];
    const server = api();

    renderWithAuth(<PartidoPage />);
    await screen.findByRole("list", { name: "En pista" });

    await waitFor(async () => expect(await loadOutbox("m1")).toEqual(EMPTY_OUTBOX));
    expect(server.count("POST", "/matches/m1/sync")).toBe(0);
  });

  it("si el dispositivo no permite leer lo guardado, el partido se abre igualmente", async () => {
    const server = api();
    // @ts-expect-error simula un navegador sin IndexedDB (p. ej. navegación privada)
    globalThis.indexedDB = undefined;

    renderWithAuth(<PartidoPage />);

    expect(await screen.findByRole("list", { name: "En pista" })).toBeInTheDocument();
    expect(server.count("POST", "/matches/m1/sync")).toBe(0);
  });
});
