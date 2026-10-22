import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LineupEventRecord, Match, StintRecord } from "@/lib/api/match-types";
import type { Player } from "@/lib/api/types";
import { mockApi } from "@/test/mock-api";
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
    is_active: true,
  }),
);
const MATCH: Match = { id: "m1", session_id: "s1", held_on: "2026-10-20", opponent: "Rival FS" };
const STARTED: LineupEventRecord = {
  id: "l1",
  seq: 1,
  payload: { type: "part_started", part: 1, starters: ["p1", "p2", "p3", "p4", "p5"] },
};
const STINT: StintRecord = { id: "t1", match_id: "m1", player_id: "p1", part: 1, start_s: 0, end_s: 300 };

let stints: StintRecord[];
let request: ReturnType<typeof vi.fn>;
let release: ReturnType<typeof vi.fn>;

beforeEach(() => {
  navigation.search = "id=m1";
  window.localStorage.clear();
  stints = [];
  release = vi.fn(async () => undefined);
  request = vi.fn(async () => ({ release, addEventListener: vi.fn() }));
  Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
  mockApi({
    "GET /matches": { data: [MATCH] },
    "GET /players": { data: PLAYERS },
    "GET /matches/m1/lineup-events": { data: [STARTED] },
    "GET /matches/m1/events": { data: [] },
    "GET /matches/m1/stints": () => ({ data: stints }),
    "GET /callup": { data: { starters: { guaranteed: [] } } },
  });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "wakeLock");
});

describe("partido: pantalla encendida", () => {
  it("mientras el partido está abierto pide que la pantalla no se apague", async () => {
    renderWithAuth(<PartidoPage />);
    await screen.findByRole("list", { name: "En pista" });

    await waitFor(() => expect(request).toHaveBeenCalledWith("screen"));
  });

  it("en un partido ya cerrado no la mantiene encendida", async () => {
    stints = [STINT];
    renderWithAuth(<PartidoPage />);
    await screen.findByRole("list", { name: "En pista" });

    expect(request).not.toHaveBeenCalled();
  });

  it("al salir del partido suelta el bloqueo", async () => {
    const { unmount } = renderWithAuth(<PartidoPage />);
    await screen.findByRole("list", { name: "En pista" });
    await waitFor(() => expect(request).toHaveBeenCalled());

    unmount();

    await waitFor(() => expect(release).toHaveBeenCalled());
  });
});
