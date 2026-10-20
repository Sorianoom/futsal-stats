import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Callup } from "@/lib/api/types";
import { mockApi } from "@/test/mock-api";
import { fakeUser, renderWithAuth } from "@/test/render-with-auth";

import ConvocatoriaPage from "./page";

const CALLUP: Callup = {
  week: "2026-10-19",
  ranking: [
    { player_id: "p1", name: "Ana Ruiz", dorsal: 9, position: "field", points: 25, excluded: null },
    { player_id: "p2", name: "Bea Soto", dorsal: 7, position: "field", points: 22, excluded: null },
    { player_id: "p3", name: "Carla Gil", dorsal: 5, position: "field", points: 22, excluded: null },
    { player_id: "p4", name: "Gema Paz", dorsal: 1, position: "goalkeeper", points: 20, excluded: null },
    { player_id: "p5", name: "Eva Mora", dorsal: 3, position: "field", points: 8, excluded: "no_play" },
  ],
  field: { guaranteed: ["p1", "p2"], tied: ["p3"], open_slots: 1 },
  goalkeepers: { guaranteed: ["p4"], tied: [], open_slots: 0 },
  starters: { guaranteed: ["p1"], tied: ["p2", "p3"], open_slots: 1 },
  breakdowns: {
    p1: {
      base: 20,
      total: 25,
      items: [
        {
          occurred_on: "2026-10-20",
          points: 5,
          reason: "Partidillo final ganado",
          infraction_code: null,
          session_id: "s1",
        },
      ],
    },
  },
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

async function rowOf(name: string): Promise<HTMLElement> {
  const button = await screen.findByRole("button", { name: new RegExp(`Ver desglose de ${name}`) });
  return button.closest("li") as HTMLElement;
}

/** El servidor devuelve la semana pedida, como hace el real. */
function api(callup: Callup = CALLUP) {
  return mockApi({
    "GET /callup": (request) => ({
      data: { ...callup, week: new URL(request.path, "http://x").searchParams.get("week") },
    }),
  });
}

function playersOf(names: string[]): Callup["ranking"] {
  return names.map((name, index) => ({
    player_id: `x${index}`,
    name,
    dorsal: index + 20,
    position: "field",
    points: 20,
    excluded: null,
  }));
}

describe("ConvocatoriaPage", () => {
  it("carga la semana actual y muestra su rango", async () => {
    const server = api();

    renderWithAuth(<ConvocatoriaPage />);

    await rowOf("Ana Ruiz");
    expect(server.calls[0].path).toBe("/callup?week=2026-10-19");
    expect(screen.getByText("19 oct – 25 oct 2026")).toBeInTheDocument();
  });

  it("muestra el ranking con puntos y etiquetas de titular, empate y exclusión", async () => {
    api();
    renderWithAuth(<ConvocatoriaPage />);

    const ana = await rowOf("Ana Ruiz");
    const carla = await rowOf("Carla Gil");
    const eva = await rowOf("Eva Mora");

    expect(within(ana).getByText("25")).toBeInTheDocument();
    expect(within(ana).getByText("Titular")).toBeInTheDocument();
    expect(within(carla).getByText("Empate")).toBeInTheDocument();
    expect(within(eva).getByText("No juega")).toBeInTheDocument();
  });

  it("resume campo y porteros con los empates y las plazas por decidir", async () => {
    api();
    renderWithAuth(<ConvocatoriaPage />);
    await rowOf("Ana Ruiz");

    const field = screen.getByRole("region", { name: "Campo" });
    expect(within(field).getByText("Ana Ruiz, Bea Soto")).toBeInTheDocument();
    expect(within(field).getByText(/1 plaza por decidir entre: Carla Gil/)).toBeInTheDocument();
    const keepers = screen.getByRole("region", { name: "Porteros" });
    expect(within(keepers).getByText("Gema Paz")).toBeInTheDocument();
    expect(within(keepers).queryByText(/por decidir/)).not.toBeInTheDocument();
  });

  it("cambia de semana con las flechas y pide la nueva semana", async () => {
    const server = api();
    renderWithAuth(<ConvocatoriaPage />);
    await rowOf("Ana Ruiz");

    await userEvent.click(screen.getByRole("button", { name: "Semana anterior" }));

    await waitFor(() => expect(server.calls.at(-1)?.path).toBe("/callup?week=2026-10-12"));
    expect(screen.getByText("12 oct – 18 oct 2026")).toBeInTheDocument();
  });

  it("abre el desglose de un jugador con la base, los movimientos y el total", async () => {
    api();
    renderWithAuth(<ConvocatoriaPage />);
    await rowOf("Ana Ruiz");

    await userEvent.click(within(await rowOf("Ana Ruiz")).getByRole("button"));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Base de la semana")).toBeInTheDocument();
    expect(within(dialog).getByText("Partidillo final ganado")).toBeInTheDocument();
    expect(within(dialog).getByText("+5")).toBeInTheDocument();
    expect(within(dialog).getByText("Total: 25")).toBeInTheDocument();
  });

  it("el desglose tiene un único control de cierre y mantiene el título al cerrarse", async () => {
    api();
    renderWithAuth(<ConvocatoriaPage />);
    await userEvent.click(within(await rowOf("Ana Ruiz")).getByRole("button"));

    const dialog = screen.getByRole("dialog", { name: "Ana Ruiz" });
    expect(within(dialog).getAllByRole("button", { name: /Cerrar|Close/ })).toHaveLength(1);
    await userEvent.click(within(dialog).getByRole("button", { name: "Cerrar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("un jugador sin movimientos muestra el aviso y uno con puntos negativos lo marca", async () => {
    const callup: Callup = {
      ...CALLUP,
      breakdowns: {
        p2: {
          base: 20,
          total: 17,
          items: [
            { occurred_on: "2026-10-20", points: -3, reason: "Falta leve", infraction_code: "L-a", session_id: null },
          ],
        },
      },
    };
    api(callup);
    renderWithAuth(<ConvocatoriaPage />);

    await userEvent.click(within(await rowOf("Ana Ruiz")).getByRole("button"));
    expect(within(screen.getByRole("dialog")).getByText("Sin movimientos esta semana")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.click(within(await rowOf("Bea Soto")).getByRole("button"));

    expect(within(screen.getByRole("dialog")).getByText("-3")).toHaveClass("text-destructive");
  });

  it("pulsar Hoy en la semana actual no deja la pantalla cargando", async () => {
    const server = api();
    renderWithAuth(<ConvocatoriaPage />);
    await rowOf("Ana Ruiz");

    await userEvent.click(screen.getByRole("button", { name: "Hoy" }));

    expect(await rowOf("Ana Ruiz")).toBeInTheDocument();
    expect(screen.queryByText("Cargando convocatoria…")).not.toBeInTheDocument();
    expect(server.count("GET", "/callup")).toBe(1);
  });

  it("Hoy vuelve a la semana actual desde otra semana", async () => {
    const server = api();
    renderWithAuth(<ConvocatoriaPage />);
    await rowOf("Ana Ruiz");
    await userEvent.click(screen.getByRole("button", { name: "Semana siguiente" }));
    await waitFor(() => expect(server.calls.at(-1)?.path).toBe("/callup?week=2026-10-26"));

    await userEvent.click(screen.getByRole("button", { name: "Hoy" }));

    await waitFor(() => expect(server.calls.at(-1)?.path).toBe("/callup?week=2026-10-19"));
    expect(screen.getByText("19 oct – 25 oct 2026")).toBeInTheDocument();
  });

  it("al reintentar tras un error quita el aviso y vuelve a pedir los datos", async () => {
    let fail = true;
    mockApi({
      "GET /callup": () =>
        fail
          ? { status: 500, error: { code: "internal_error", message: "Fallo" } }
          : { data: CALLUP },
    });
    renderWithAuth(<ConvocatoriaPage />);
    await screen.findByRole("alert");
    fail = false;

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await rowOf("Ana Ruiz");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("si falla al cambiar de semana no deja ver los datos de la anterior", async () => {
    mockApi({
      "GET /callup": (request) =>
        request.path.endsWith("2026-10-19")
          ? { data: CALLUP }
          : { status: 500, error: { code: "internal_error", message: "Fallo" } },
    });
    renderWithAuth(<ConvocatoriaPage />);
    await rowOf("Ana Ruiz");

    await userEvent.click(screen.getByRole("button", { name: "Semana anterior" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ver desglose de Ana Ruiz/ })).not.toBeInTheDocument();
  });

  it("gana la última semana pedida aunque la anterior responda más tarde", async () => {
    let releaseSlow: () => void = () => undefined;
    const slow = new Promise<void>((resolve) => (releaseSlow = resolve));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const week = new URL(String(input)).searchParams.get("week");
        const name = week === "2026-10-12" ? "Semana vieja" : "Semana actual";
        if (week === "2026-10-12") await slow;
        const data = { ...CALLUP, week, ranking: playersOf([name]) };
        return new Response(JSON.stringify({ success: true, data, error: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    renderWithAuth(<ConvocatoriaPage />);
    await rowOf("Semana actual");

    await userEvent.click(screen.getByRole("button", { name: "Semana anterior" }));
    await userEvent.click(screen.getByRole("button", { name: "Hoy" }));
    await rowOf("Semana actual");
    releaseSlow();

    await waitFor(() => expect(screen.queryByText("Semana vieja")).not.toBeInTheDocument());
    expect(screen.getByText("19 oct – 25 oct 2026")).toBeInTheDocument();
  });

  it("marca como convocado a quien está en campo sin ser titular", async () => {
    api();
    renderWithAuth(<ConvocatoriaPage />);

    expect(within(await rowOf("Bea Soto")).getByText("Convocado")).toBeInTheDocument();
  });

  it("indica las plazas sin cubrir, a nadie confirmado y los ids desconocidos", async () => {
    const callup: Callup = {
      ...CALLUP,
      ranking: playersOf(["Zoe Lara"]),
      field: { guaranteed: [], tied: [], open_slots: 2 },
      goalkeepers: { guaranteed: [], tied: [], open_slots: 1 },
      starters: { guaranteed: ["fantasma"], tied: [], open_slots: 0 },
    };
    api(callup);
    renderWithAuth(<ConvocatoriaPage />);
    await rowOf("Zoe Lara");

    const field = screen.getByRole("region", { name: "Campo" });
    expect(within(field).getByText("Nadie confirmado todavía")).toBeInTheDocument();
    expect(within(field).getByText("2 plazas sin cubrir")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Porteros" })).getByText("1 plaza sin cubrir"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Titulares" })).getByText("Jugador desconocido"),
    ).toBeInTheDocument();
  });

  it("avisa si no se puede cargar y permite reintentar", async () => {
    mockApi({ "GET /callup": { status: 500, error: { code: "internal_error", message: "Fallo" } } });
    renderWithAuth(<ConvocatoriaPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar la convocatoria");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("el segundo entrenador no ve la convocatoria ni la pide", () => {
    const server = api();

    renderWithAuth(<ConvocatoriaPage />, { user: fakeUser("assistant_coach") });

    expect(screen.getByText("Solo el entrenador puede ver la convocatoria")).toBeInTheDocument();
    expect(server.calls).toHaveLength(0);
  });
});
