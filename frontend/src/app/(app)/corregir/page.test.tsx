import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LoggedEvent, Match, StintRecord } from "@/lib/api/match-types";
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
  is_active: true, has_account: false,
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
let events: LoggedEvent[];

const ev = (
  id: string,
  seq: number,
  kind: LoggedEvent["kind"],
  part: number,
  t: number,
  player: string | null = null,
  voids: string | null = null,
): LoggedEvent => ({ id, seq, kind, part, t, player_id: player, voids_event_id: voids });

beforeEach(() => {
  events = [
    ev("e1", 1, "goal", 1, 300, "p1"),
    ev("e2", 2, "foul", 1, 400, "p2"),
    ev("e3", 3, "undo", 1, 400, null, "e2"),
    ev("e4", 4, "red", 2, 700, "p3"),
  ];
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
    "GET /matches/m1/events": () => ({ data: events }),
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

describe("CorregirPage: eventos", () => {
  it("lista los eventos vigentes con su hora y quién los hizo, sin los deshechos", async () => {
    api();

    renderWithAuth(<CorregirPage />);

    const list = await screen.findByRole("list", { name: "Eventos" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("1ª parte · 15:00 · Gol de Ana Ruiz")).toBeInTheDocument();
    expect(within(list).getByText("2ª parte · 08:20 · Roja de Carla Ruiz")).toBeInTheDocument();
    expect(within(list).queryByText(/Falta/)).not.toBeInTheDocument();
  });

  it("deshace un evento tras confirmar enviando un deshacer con el siguiente seq", async () => {
    const server = api({
      "POST /matches/m1/sync": (request) => {
        const sent = (request.body as { events: LoggedEvent[] }).events[0];
        events = [...events, { ...sent, player_id: null }];
        return { data: { accepted: [sent.id], duplicates: [], rejected: [] } };
      },
    });
    renderWithAuth(<CorregirPage />);
    await screen.findByRole("list", { name: "Eventos" });

    await userEvent.click(screen.getByRole("button", { name: "Deshacer Gol de Ana Ruiz" }));
    expect(server.calls.some((c) => c.method === "POST")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Confirmar deshacer" }));

    await waitFor(() => expect(screen.queryByText(/Gol de Ana Ruiz/)).not.toBeInTheDocument());
    const body = server.calls.find((c) => c.method === "POST")?.body as { events: LoggedEvent[] };
    expect(body.events[0]).toMatchObject({ kind: "undo", voids_event_id: "e1", seq: 5, part: 1, t: 300 });
  });

  it("un doble toque en Deshacer no confirma", async () => {
    const server = api();
    renderWithAuth(<CorregirPage />);
    await screen.findByRole("list", { name: "Eventos" });

    await userEvent.dblClick(screen.getByRole("button", { name: "Deshacer Gol de Ana Ruiz" }));

    expect(server.calls.some((c) => c.method === "POST")).toBe(false);
    expect(screen.getByRole("button", { name: "Confirmar deshacer" })).toBeInTheDocument();
  });

  it("deshacer una roja avisa de que no devuelve al jugador a la pista", async () => {
    api();
    renderWithAuth(<CorregirPage />);
    await screen.findByRole("list", { name: "Eventos" });

    await userEvent.click(screen.getByRole("button", { name: "Deshacer Roja de Carla Ruiz" }));

    expect(screen.getByText(/no devuelve al jugador a la pista/)).toBeInTheDocument();
  });

  it("un motivo del servidor se explica en español y la lista se refresca", async () => {
    const server = api({
      "POST /matches/m1/sync": (request) => ({
        data: {
          accepted: [],
          duplicates: [],
          rejected: [
            {
              id: (request.body as { events: { id: string }[] }).events[0].id,
              reason: "void_target_missing",
            },
          ],
        },
      }),
    });
    renderWithAuth(<CorregirPage />);
    await screen.findByRole("list", { name: "Eventos" });
    await userEvent.click(screen.getByRole("button", { name: "Deshacer Gol de Ana Ruiz" }));

    await userEvent.click(screen.getByRole("button", { name: "Confirmar deshacer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo deshacer: ese evento ya no existe",
    );
    await waitFor(() => expect(server.count("GET", "/matches/m1/events")).toBe(2));
  });

  it("si ya estaba deshecho lo da por hecho, sin avisos, y refresca la lista", async () => {
    const server = api({
      "POST /matches/m1/sync": (request) => ({
        data: {
          accepted: [],
          duplicates: [],
          rejected: [
            {
              id: (request.body as { events: { id: string }[] }).events[0].id,
              reason: "already_voided",
            },
          ],
        },
      }),
    });
    renderWithAuth(<CorregirPage />);
    await screen.findByRole("list", { name: "Eventos" });
    await userEvent.click(screen.getByRole("button", { name: "Deshacer Gol de Ana Ruiz" }));

    await userEvent.click(screen.getByRole("button", { name: "Confirmar deshacer" }));

    await waitFor(() => expect(server.count("GET", "/matches/m1/events")).toBe(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("si otro dispositivo anotó eventos mientras tanto lo explica y recarga", async () => {
    const server = api({
      "POST /matches/m1/sync": (request) => ({
        data: {
          accepted: [],
          duplicates: [],
          rejected: [
            {
              id: (request.body as { events: { id: string }[] }).events[0].id,
              reason: "seq_conflict",
            },
          ],
        },
      }),
    });
    renderWithAuth(<CorregirPage />);
    await screen.findByRole("list", { name: "Eventos" });
    await userEvent.click(screen.getByRole("button", { name: "Deshacer Gol de Ana Ruiz" }));

    await userEvent.click(screen.getByRole("button", { name: "Confirmar deshacer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("desde otro dispositivo");
    await waitFor(() => expect(server.count("GET", "/matches/m1/events")).toBe(2));
  });

  it("tras un corte de red reintenta con el mismo id y seq y recarga la lista", async () => {
    const attempts: { id: string; seq: number }[] = [];
    const server = api({
      "POST /matches/m1/sync": (request) => {
        const sent = (request.body as { events: LoggedEvent[] }).events[0];
        events = [...events, { ...sent, player_id: null }];
        return { data: { accepted: [sent.id], duplicates: [], rejected: [] } };
      },
    });
    renderWithAuth(<CorregirPage />);
    await screen.findByRole("list", { name: "Eventos" });
    const original = globalThis.fetch;
    let online = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as { events: { id: string; seq: number }[] };
          attempts.push(body.events[0]);
          if (!online) throw new TypeError("Failed to fetch");
        }
        return original(input, init);
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Deshacer Gol de Ana Ruiz" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar deshacer" }));
    await screen.findByRole("alert");
    await waitFor(() => expect(server.count("GET", "/matches/m1/events")).toBe(2));
    online = true;

    await userEvent.click(screen.getByRole("button", { name: "Deshacer Gol de Ana Ruiz" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar deshacer" }));

    await waitFor(() => expect(screen.queryByText(/Gol de Ana Ruiz/)).not.toBeInTheDocument());
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
  });

  it("dos deshacer seguidos usan secuencias distintas", async () => {
    const seqs: number[] = [];
    api({
      "POST /matches/m1/sync": (request) => {
        const sent = (request.body as { events: LoggedEvent[] }).events[0];
        seqs.push(sent.seq);
        events = [...events, { ...sent, player_id: null }];
        return { data: { accepted: [sent.id], duplicates: [], rejected: [] } };
      },
    });
    renderWithAuth(<CorregirPage />);
    await screen.findByRole("list", { name: "Eventos" });

    await userEvent.click(screen.getByRole("button", { name: "Deshacer Gol de Ana Ruiz" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar deshacer" }));
    await userEvent.click(await screen.findByRole("button", { name: "Deshacer Roja de Carla Ruiz" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar deshacer" }));

    await waitFor(() => expect(seqs).toHaveLength(2));
    expect(seqs[1]).toBe(seqs[0] + 1);
  });

  it("si se corta la red al deshacer avisa y deja volver a intentarlo", async () => {
    api();
    renderWithAuth(<CorregirPage />);
    await screen.findByRole("list", { name: "Eventos" });
    await userEvent.click(screen.getByRole("button", { name: "Deshacer Gol de Ana Ruiz" }));
    const original = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") throw new TypeError("Failed to fetch");
        return original(input, init);
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Confirmar deshacer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Sin conexión");
    expect(screen.getByRole("button", { name: "Deshacer Gol de Ana Ruiz" })).toBeInTheDocument();
  });

  it("sin eventos lo indica", async () => {
    events = [];
    api();

    renderWithAuth(<CorregirPage />);

    expect(await screen.findByText("No hay eventos anotados")).toBeInTheDocument();
  });

  it("si no se pueden cargar los eventos avisa y deja reintentar sin esconder los tramos", async () => {
    api({ "GET /matches/m1/events": { status: 500, error: { code: "internal_error", message: "Fallo" } } });

    renderWithAuth(<CorregirPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar los eventos");
    expect(await screen.findByRole("list", { name: "Tramos de la parte 1" })).toBeInTheDocument();
  });
});
