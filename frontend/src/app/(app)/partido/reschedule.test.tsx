import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Match } from "@/lib/api/match-types";
import type { Player } from "@/lib/api/types";
import { mockApi, type MockHandler } from "@/test/mock-api";
import { renderWithAuth } from "@/test/render-with-auth";

import PartidoPage from "./page";

const navigation = vi.hoisted(() => ({ search: "id=m1", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ push: navigation.push, replace: vi.fn() }),
}));

const PLAYERS: Player[] = ["Ana", "Bea", "Carla", "Dani", "Elena", "Fran"].map((name, index) => ({
  id: `p${index + 1}`,
  name: `${name} Ruiz`,
  dorsal: index + 2,
  position: index === 5 ? "goalkeeper" : "field",
  status: "available",
  is_active: true,
  has_account: false,
}));
// Fechas lejanas: la prueba no caduca con el paso del tiempo.
const MATCH: Match = { id: "m1", session_id: "s1", held_on: "2030-03-16", opponent: "Rival FS", is_official: true };

let match: Match;

beforeEach(() => {
  window.localStorage.clear();
  match = MATCH;
});

function api(patch: MockHandler) {
  return mockApi({
    "GET /matches": () => ({ data: [match] }),
    "GET /players": { data: PLAYERS },
    "GET /matches/m1/lineup-events": { data: [] },
    "GET /matches/m1/events": { data: [] },
    "GET /matches/m1/stints": { data: [] },
    "GET /callup": { data: { starters: { guaranteed: [] } } },
    "PATCH /matches/m1": patch,
  });
}

async function chooseDate(day: string) {
  await userEvent.click(await screen.findByRole("button", { name: "Cambiar fecha" }));
  const dialog = screen.getByRole("dialog");
  const input = within(dialog).getByLabelText("Nueva fecha");
  await userEvent.clear(input);
  await userEvent.type(input, day);
  await userEvent.click(within(dialog).getByRole("button", { name: "Cambiar fecha" }));
}

describe("cambiar la fecha de un partido programado", () => {
  it("antes de empezar muestra el día del partido", async () => {
    api(() => ({ data: match }));
    renderWithAuth(<PartidoPage />);

    const section = await screen.findByRole("region", { name: "Fecha del partido" });

    expect(within(section).getByText(/sábado, 16 de marzo/i)).toBeInTheDocument();
  });

  it("guarda el nuevo día y lo muestra al recargar", async () => {
    const server = api((request) => {
      match = { ...match, held_on: (request.body as { held_on: string }).held_on };
      return { data: match };
    });
    renderWithAuth(<PartidoPage />);

    await chooseDate("2030-03-23");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const patch = server.calls.find((call) => call.method === "PATCH");
    expect(patch?.body).toEqual({ held_on: "2030-03-23" });
    // El tablero se vuelve a montar al recargar: se busca en toda la pantalla, no en la sección vieja.
    expect(await screen.findByText(/sábado, 23 de marzo/i, undefined, { timeout: 5000 })).toBeInTheDocument();
  });

  it("no deja elegir un día anterior a hoy", async () => {
    const server = api(() => ({ data: match }));
    renderWithAuth(<PartidoPage />);

    await chooseDate("2020-01-04");

    expect(await screen.findByRole("alert")).toHaveTextContent("no puede ser anterior a hoy");
    expect(server.calls.some((call) => call.method === "PATCH")).toBe(false);
  });

  it("si el servidor lo rechaza, se queda abierto con su explicación", async () => {
    api(() => ({
      status: 409,
      error: { code: "match_started", message: "El partido ya ha empezado: no se le puede cambiar el día" },
    }));
    renderWithAuth(<PartidoPage />);

    await chooseDate("2030-03-23");

    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("ya ha empezado");
  });
});
