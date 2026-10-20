import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Match, StintRecord } from "@/lib/api/match-types";
import type { Player } from "@/lib/api/types";
import { mockApi, type MockHandler } from "@/test/mock-api";
import { fakeUser, renderWithAuth } from "@/test/render-with-auth";

import CorregirPage from "./page";

const navigation = vi.hoisted(() => ({ search: "id=m1" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const PLAYERS: Player[] = ["Ana", "Bea", "Carla"].map((name, index) => ({
  id: `p${index + 1}`,
  name: `${name} Ruiz`,
  dorsal: index + 2,
  position: "field",
  status: "available",
  is_active: true,
}));
const MATCH: Match = { id: "m1", session_id: "s1", held_on: "2026-10-20", opponent: "Rival FS" };

const stint = (id: string, player: string, part: number, start: number, end: number): StintRecord => ({
  id,
  match_id: "m1",
  player_id: player,
  part,
  start_s: start,
  end_s: end,
});

let stints: StintRecord[];

beforeEach(() => {
  navigation.search = "id=m1";
  window.localStorage.clear();
  stints = [
    stint("t1", "p1", 1, 0, 300),
    stint("t2", "p2", 1, 0, 1200),
    stint("t3", "p1", 2, 600, 1200),
  ];
});

function api(extra: Record<string, MockHandler> = {}) {
  return mockApi({
    "GET /matches": { data: [MATCH] },
    "GET /players": { data: PLAYERS },
    "GET /matches/m1/stints": () => ({ data: stints }),
    ...extra,
  });
}

async function typeTime(digits: string) {
  const dialog = screen.getByRole("dialog");
  for (const digit of digits) {
    await userEvent.click(within(dialog).getByRole("button", { name: digit }));
  }
  await userEvent.click(within(dialog).getByRole("button", { name: "Aceptar" }));
}

describe("CorregirPage", () => {
  it("lista los tramos por parte con el jugador y las horas como las vería el marcador", async () => {
    api();

    renderWithAuth(<CorregirPage />);

    const part1 = await screen.findByRole("list", { name: "Tramos de la parte 1" });
    expect(within(part1).getAllByRole("listitem")).toHaveLength(2);
    const ana = within(part1).getByText("Ana Ruiz").closest("li") as HTMLElement;
    expect(within(ana).getByText("de 20:00 a 15:00")).toBeInTheDocument();
    const part2 = screen.getByRole("list", { name: "Tramos de la parte 2" });
    expect(within(part2).getByText("de 10:00 a 00:00")).toBeInTheDocument();
  });

  it("si el partido no está cerrado explica que no hay tramos y enlaza al partido", async () => {
    stints = [];
    api();

    renderWithAuth(<CorregirPage />);

    expect(await screen.findByText(/no tiene tramos que corregir/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir al partido" })).toHaveAttribute("href", "/partido?id=m1");
  });

  it("avisa de que rehacer el cierre borraría las correcciones y enlaza a las estadísticas", async () => {
    api();

    renderWithAuth(<CorregirPage />);

    expect(
      await screen.findByText(/Rehacer el cierre del partido borra estas correcciones/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver estadísticas" })).toHaveAttribute(
      "href",
      "/estadisticas?id=m1",
    );
  });

  it("borra un tramo tras confirmar y recarga la lista", async () => {
    const server = api({
      "DELETE /stints/t1": () => {
        stints = stints.filter((s) => s.id !== "t1");
        return { data: {} };
      },
    });
    renderWithAuth(<CorregirPage />);
    await screen.findByRole("list", { name: "Tramos de la parte 1" });

    await userEvent.click(screen.getByRole("button", { name: "Borrar tramo de Ana Ruiz de 20:00 a 15:00" }));
    expect(server.calls.some((c) => c.method === "DELETE")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Confirmar borrar" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Borrar tramo de Ana Ruiz de 20:00 a 15:00" }),
      ).not.toBeInTheDocument(),
    );
    expect(server.count("DELETE", "/stints/t1")).toBe(1);
  });

  it("un doble toque en Borrar no confirma el borrado", async () => {
    const server = api();
    renderWithAuth(<CorregirPage />);
    await screen.findByRole("list", { name: "Tramos de la parte 1" });

    await userEvent.dblClick(screen.getByRole("button", { name: "Borrar tramo de Ana Ruiz de 20:00 a 15:00" }));

    expect(server.calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(screen.getByRole("button", { name: "Confirmar borrar" })).toBeInTheDocument();
  });

  it("si falla el borrado avisa y deja volver a intentarlo", async () => {
    api({ "DELETE /stints/t1": { status: 500, error: { code: "internal_error", message: "Fallo" } } });
    renderWithAuth(<CorregirPage />);
    await screen.findByRole("list", { name: "Tramos de la parte 1" });
    await userEvent.click(screen.getByRole("button", { name: "Borrar tramo de Ana Ruiz de 20:00 a 15:00" }));

    await userEvent.click(screen.getByRole("button", { name: "Confirmar borrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo borrar el tramo");
    expect(
      screen.getByRole("button", { name: "Borrar tramo de Ana Ruiz de 20:00 a 15:00" }),
    ).toBeInTheDocument();
  });

  it("edita la hora de salida con el teclado del marcador y envía solo lo que cambia", async () => {
    const server = api({ "PATCH /stints/t1": () => ({ data: stint("t1", "p1", 1, 0, 360) }) });
    renderWithAuth(<CorregirPage />);
    await screen.findByRole("list", { name: "Tramos de la parte 1" });

    await userEvent.click(screen.getByRole("button", { name: "Editar tramo de Ana Ruiz de 20:00 a 15:00" }));
    const dialog = screen.getByRole("dialog", { name: "Editar tramo" });
    await userEvent.click(within(dialog).getByRole("button", { name: /Sale: 15:00/ }));
    await typeTime("1400");
    expect(within(dialog).getByRole("button", { name: /Sale: 14:00/ })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(server.calls.find((c) => c.method === "PATCH")?.body).toEqual({ end_s: 360 });
  });

  it("muestra el motivo si el servidor rechaza el cambio y deja el diálogo abierto", async () => {
    api({
      "PATCH /stints/t1": {
        status: 422,
        error: { code: "validation_error", message: "El tramo se solapa con otro del mismo jugador" },
      },
    });
    renderWithAuth(<CorregirPage />);
    await screen.findByRole("list", { name: "Tramos de la parte 1" });
    await userEvent.click(screen.getByRole("button", { name: "Editar tramo de Ana Ruiz de 20:00 a 15:00" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /Sale: 15:00/ }));
    await typeTime("1000");

    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("se solapa");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("no envía nada si no se cambia nada", async () => {
    const server = api();
    renderWithAuth(<CorregirPage />);
    await screen.findByRole("list", { name: "Tramos de la parte 1" });
    await userEvent.click(screen.getByRole("button", { name: "Editar tramo de Ana Ruiz de 20:00 a 15:00" }));

    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(server.calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("no deja que la salida sea anterior a la entrada", async () => {
    const server = api();
    renderWithAuth(<CorregirPage />);
    await screen.findByRole("list", { name: "Tramos de la parte 1" });
    await userEvent.click(screen.getByRole("button", { name: "Editar tramo de Ana Ruiz de 20:00 a 15:00" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /Sale: 15:00/ }));
    await typeTime("2000");

    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));

    expect(within(dialog).getByText("La salida tiene que ser posterior a la entrada")).toBeInTheDocument();
    expect(server.calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("cancelar el teclado vuelve al formulario sin cambiar la hora", async () => {
    api();
    renderWithAuth(<CorregirPage />);
    await screen.findByRole("list", { name: "Tramos de la parte 1" });
    await userEvent.click(screen.getByRole("button", { name: "Editar tramo de Ana Ruiz de 20:00 a 15:00" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /Sale: 15:00/ }));

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    expect(within(dialog).getByRole("button", { name: /Sale: 15:00/ })).toBeInTheDocument();
  });

  it("añade un tramo eligiendo jugador, parte y horas", async () => {
    const server = api({ "POST /matches/m1/stints": () => ({ data: stint("t9", "p3", 2, 0, 600) }) });
    renderWithAuth(<CorregirPage />);
    await screen.findByRole("list", { name: "Tramos de la parte 1" });

    await userEvent.click(screen.getByRole("button", { name: "Añadir tramo" }));
    const dialog = screen.getByRole("dialog", { name: "Añadir tramo" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Jugador"), "p3");
    await userEvent.selectOptions(within(dialog).getByLabelText("Parte"), "2");
    await userEvent.click(within(dialog).getByRole("button", { name: /Sale: 00:00/ }));
    await typeTime("1000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(server.calls.find((c) => c.method === "POST")?.body).toEqual({
      player_id: "p3",
      part: 2,
      start_s: 0,
      end_s: 600,
    });
  });

  it("al añadir un tramo pide elegir jugador", async () => {
    const server = api();
    renderWithAuth(<CorregirPage />);
    await screen.findByRole("list", { name: "Tramos de la parte 1" });
    await userEvent.click(screen.getByRole("button", { name: "Añadir tramo" }));
    const dialog = screen.getByRole("dialog");

    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));

    expect(within(dialog).getByText("Elige un jugador")).toBeInTheDocument();
    expect(server.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("solo el entrenador puede corregir partidos", () => {
    const server = api();

    renderWithAuth(<CorregirPage />, { user: fakeUser("assistant_coach") });

    expect(screen.getByText("Solo el entrenador puede corregir partidos")).toBeInTheDocument();
    expect(server.calls).toHaveLength(0);
  });

  it("avisa si no se pueden cargar los tramos y permite reintentar", async () => {
    api({ "GET /matches/m1/stints": { status: 500, error: { code: "internal_error", message: "Fallo" } } });

    renderWithAuth(<CorregirPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar los tramos");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("avisa si el partido no existe", async () => {
    navigation.search = "id=desconocido";
    api({ "GET /matches/desconocido/stints": { status: 404, error: { code: "not_found", message: "No" } } });

    renderWithAuth(<CorregirPage />);

    expect(await screen.findByText("Partido no encontrado")).toBeInTheDocument();
  });

  it("sin id en la dirección pide volver a elegir un partido", () => {
    navigation.search = "";
    api();

    renderWithAuth(<CorregirPage />);

    expect(screen.getByText("Elige un partido para corregirlo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a las estadísticas" })).toHaveAttribute(
      "href",
      "/estadisticas",
    );
  });
});
