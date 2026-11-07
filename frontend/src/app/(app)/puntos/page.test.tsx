import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Infraction, InfractionRegistered, Movement, Player } from "@/lib/api/types";
import { mockApi, type MockHandler } from "@/test/mock-api";
import { fakeUser, renderWithAuth } from "@/test/render-with-auth";

import PuntosPage from "./page";

const PLAYERS: Player[] = [
  { id: "p1", name: "Ana Ruiz", dorsal: 9, position: "field", status: "available", is_active: true, has_account: false },
  { id: "p2", name: "Bea Soto", dorsal: 7, position: "field", status: "available", is_active: true, has_account: false },
  { id: "p9", name: "Zoe Baja", dorsal: 30, position: "field", status: "available", is_active: false, has_account: false },
];

const CATALOG: Infraction[] = [
  {
    code: "L-a",
    severity: "light",
    points: -3,
    description: "Falta de atención e implicación",
    deferral: "none",
    sanction: null,
    in_pdf_letter: true,
  },
  {
    code: "G-h",
    severity: "serious",
    points: -5,
    description: "Reincidencia en faltas leves: 4 en una semana",
    deferral: "none",
    sanction: null,
    in_pdf_letter: true,
  },
];

const MOVEMENT: Movement = {
  id: "m1",
  player_id: "p1",
  occurred_on: "2026-10-20",
  points: -3,
  reason: "Falta de atención e implicación",
  applies_week: "2026-10-19",
  session_id: null,
  infraction_code: "L-a",
};
const WIN: Movement = {
  id: "m2",
  player_id: "p9",
  occurred_on: "2026-10-20",
  points: 5,
  reason: "Partidillo final ganado",
  applies_week: "2026-10-19",
  session_id: "s1",
  infraction_code: null,
};

let movements: Movement[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T10:00:00Z"));
  movements = [MOVEMENT, WIN];
});

afterEach(() => {
  vi.useRealTimers();
});

function api(extra: Record<string, MockHandler> = {}) {
  return mockApi({
    "GET /players": (request) => ({
      data: request.path.includes("include_inactive") ? PLAYERS : PLAYERS.filter((p) => p.is_active),
    }),
    "GET /movements": () => ({ data: movements }),
    "GET /catalog/infractions": { data: CATALOG },
    ...extra,
  });
}

const registered = (overrides: Partial<InfractionRegistered> = {}): InfractionRegistered => ({
  movement: { ...MOVEMENT, id: "m3" },
  escalations: [],
  sanction: null,
  ...overrides,
});


/** Falla el primer POST como un corte de red y registra la clave de cada intento. */
function failFirstPosts(count: number, keys: (string | null)[]) {
  const original = globalThis.fetch;
  let failures = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        keys.push(new Headers(init.headers).get("Idempotency-Key"));
        if (failures < count) {
          failures += 1;
          throw new TypeError("Failed to fetch");
        }
      }
      return original(input, init);
    }),
  );
}

async function openForm() {
  await screen.findByText("Ana Ruiz");
  await userEvent.click(screen.getByRole("button", { name: "Registrar falta" }));
  return screen.getByRole("dialog");
}

describe("PuntosPage", () => {
  it("lista los movimientos de la semana con jugador, motivo y puntos con signo", async () => {
    const server = api();

    renderWithAuth(<PuntosPage />);

    const list = await screen.findByRole("list", { name: "Movimientos" });
    expect(server.calls.some((c) => c.path === "/movements?week=2026-10-19")).toBe(true);
    const fault = within(list).getByText("Ana Ruiz").closest("li") as HTMLElement;
    expect(within(fault).getByText("Falta de atención e implicación")).toBeInTheDocument();
    expect(within(fault).getByText("-3")).toBeInTheDocument();
    const win = within(list).getByText("Zoe Baja").closest("li") as HTMLElement;
    expect(within(win).getByText("+5")).toBeInTheDocument();
  });

  it("indica cuando la semana no tiene movimientos", async () => {
    movements = [];
    api();

    renderWithAuth(<PuntosPage />);

    expect(await screen.findByText("No hay movimientos esta semana")).toBeInTheDocument();
  });

  it("cambia de semana y pide los movimientos de esa semana", async () => {
    const server = api();
    renderWithAuth(<PuntosPage />);
    await screen.findByText("Ana Ruiz");

    await userEvent.click(screen.getByRole("button", { name: "Semana anterior" }));

    await waitFor(() =>
      expect(server.calls.some((c) => c.path === "/movements?week=2026-10-12")).toBe(true),
    );
    expect(screen.getByText("12 oct – 18 oct 2026")).toBeInTheDocument();
  });

  it("avisa si no se puede cargar y permite reintentar", async () => {
    api({ "GET /movements": { status: 500, error: { code: "internal_error", message: "Fallo" } } });
    renderWithAuth(<PuntosPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar los movimientos");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("registra una falta con la fecha de hoy y recarga la lista", async () => {
    const server = api({ "POST /movements/infractions": () => ({ data: registered() }) });
    renderWithAuth(<PuntosPage />);
    const dialog = await openForm();

    await userEvent.selectOptions(within(dialog).getByLabelText("Jugador"), "p1");
    await userEvent.selectOptions(within(dialog).getByLabelText("Falta"), "L-a");
    await userEvent.click(within(dialog).getByRole("button", { name: "Registrar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const post = server.calls.find((c) => c.method === "POST");
    expect(post?.body).toEqual({
      player_id: "p1",
      infraction_code: "L-a",
      occurred_on: "2026-10-21",
      in_match: false,
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Falta registrada");
    expect(server.count("GET", "/movements")).toBe(2);
  });

  it("envía si ocurrió en partido y el motivo", async () => {
    const server = api({ "POST /movements/infractions": () => ({ data: registered() }) });
    renderWithAuth(<PuntosPage />);
    const dialog = await openForm();

    await userEvent.selectOptions(within(dialog).getByLabelText("Jugador"), "p2");
    await userEvent.selectOptions(within(dialog).getByLabelText("Falta"), "G-h");
    await userEvent.click(within(dialog).getByLabelText("Ocurrió en un partido"));
    await userEvent.type(within(dialog).getByLabelText("Motivo (opcional)"), "  Discutió con el árbitro ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Registrar" }));

    await waitFor(() => expect(server.calls.some((c) => c.method === "POST")).toBe(true));
    expect(server.calls.find((c) => c.method === "POST")?.body).toMatchObject({
      player_id: "p2",
      infraction_code: "G-h",
      in_match: true,
      reason: "Discutió con el árbitro",
    });
  });

  it("no envía el formulario sin jugador ni falta y lo explica", async () => {
    const server = api();
    renderWithAuth(<PuntosPage />);
    const dialog = await openForm();

    await userEvent.click(within(dialog).getByRole("button", { name: "Registrar" }));

    expect(within(dialog).getByText("Elige un jugador")).toBeInTheDocument();
    expect(within(dialog).getByText("Elige una falta")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Jugador")).toHaveAttribute("aria-invalid", "true");
    expect(server.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("solo ofrece jugadores en activo para registrar la falta", async () => {
    api();
    renderWithAuth(<PuntosPage />);
    const dialog = await openForm();

    const options = within(within(dialog).getByLabelText("Jugador")).getAllByRole("option");

    expect(options.map((o) => o.textContent)).toEqual([
      "Selecciona un jugador",
      "9 · Ana Ruiz",
      "7 · Bea Soto",
    ]);
  });

  it("muestra la sanción y las escalaciones propuestas tras registrar", async () => {
    api({
      "POST /movements/infractions": () => ({
        data: registered({
          escalations: [{ infraction_code: "G-h", week: "2026-10-19", session_id: null }],
          sanction: { kind: "no_play", min_matches: 1, max_matches: 2 },
        }),
      }),
    });
    renderWithAuth(<PuntosPage />);
    const dialog = await openForm();
    await userEvent.selectOptions(within(dialog).getByLabelText("Jugador"), "p1");
    await userEvent.selectOptions(within(dialog).getByLabelText("Falta"), "L-a");

    await userEvent.click(within(dialog).getByRole("button", { name: "Registrar" }));

    const result = await screen.findByRole("status");
    expect(result).toHaveTextContent("Sanción propuesta: No juega (1–2 partidos)");
    expect(result).toHaveTextContent("Propuesta: G-h · Reincidencia en faltas leves: 4 en una semana");
    expect(result).toHaveTextContent("El entrenador la confirma más adelante");
  });

  it("mantiene el formulario abierto y muestra el error si el servidor rechaza la falta", async () => {
    api({
      "POST /movements/infractions": {
        status: 404,
        error: { code: "not_found", message: "Jugador no encontrado" },
      },
    });
    renderWithAuth(<PuntosPage />);
    const dialog = await openForm();
    await userEvent.selectOptions(within(dialog).getByLabelText("Jugador"), "p1");
    await userEvent.selectOptions(within(dialog).getByLabelText("Falta"), "L-a");

    await userEvent.click(within(dialog).getByRole("button", { name: "Registrar" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Jugador no encontrado");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("deshacer pide confirmación y borra el movimiento", async () => {
    const server = api({
      "DELETE /movements/m1": () => {
        movements = movements.filter((m) => m.id !== "m1");
        return { data: MOVEMENT };
      },
    });
    renderWithAuth(<PuntosPage />);
    await screen.findByText("Ana Ruiz");

    await userEvent.click(screen.getByRole("button", { name: "Deshacer Ana Ruiz: Falta de atención e implicación" }));
    expect(server.calls.some((c) => c.method === "DELETE")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Confirmar deshacer" }));

    await waitFor(() => expect(screen.queryByText("Ana Ruiz")).not.toBeInTheDocument());
    expect(server.count("DELETE", "/movements/m1")).toBe(1);
  });

  it("un doble toque en Deshacer no confirma el borrado", async () => {
    const server = api();
    renderWithAuth(<PuntosPage />);
    await screen.findByText("Ana Ruiz");

    await userEvent.dblClick(
      screen.getByRole("button", { name: "Deshacer Ana Ruiz: Falta de atención e implicación" }),
    );

    expect(server.calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(screen.getByRole("button", { name: "Confirmar deshacer" })).toBeInTheDocument();
  });

  it("si falla el borrado avisa y vuelve a pedir confirmación", async () => {
    api({ "DELETE /movements/m1": { status: 500, error: { code: "internal_error", message: "Fallo" } } });
    renderWithAuth(<PuntosPage />);
    await screen.findByText("Ana Ruiz");
    await userEvent.click(screen.getByRole("button", { name: "Deshacer Ana Ruiz: Falta de atención e implicación" }));

    await userEvent.click(screen.getByRole("button", { name: "Confirmar deshacer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo deshacer");
    expect(
      screen.getByRole("button", { name: "Deshacer Ana Ruiz: Falta de atención e implicación" }),
    ).toBeInTheDocument();
  });

  it("si fallan jugadores y catálogo avisa, no deja cargando y permite reintentar", async () => {
    let failReference = true;
    api({
      "GET /players": () =>
        failReference
          ? { status: 500, error: { code: "internal_error", message: "Fallo" } }
          : { data: PLAYERS },
    });
    renderWithAuth(<PuntosPage />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Registrar falta" })).toBeDisabled();
    failReference = false;
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await screen.findByText("Ana Ruiz");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar falta" })).toBeEnabled();
  });

  it("no deja cerrar el formulario mientras se envía y solo hace un POST aunque se pulse dos veces", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const server = api({
      "POST /movements/infractions": () => {
        void gate;
        return { data: registered() };
      },
    });
    const original = globalThis.fetch;
    const slowFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") await gate;
      return original(input, init);
    });
    vi.stubGlobal("fetch", slowFetch);
    renderWithAuth(<PuntosPage />);
    const dialog = await openForm();
    await userEvent.selectOptions(within(dialog).getByLabelText("Jugador"), "p1");
    await userEvent.selectOptions(within(dialog).getByLabelText("Falta"), "L-a");

    await userEvent.dblClick(within(dialog).getByRole("button", { name: "Registrar" }));
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    release();

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(slowFetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(server.calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("si se corta la red al registrar avisa de que puede haberse registrado", async () => {
    const original = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") throw new TypeError("Failed to fetch");
        return original(input, init);
      }),
    );
    renderWithAuth(<PuntosPage />);
    const dialog = await openForm();
    await userEvent.selectOptions(within(dialog).getByLabelText("Jugador"), "p1");
    await userEvent.selectOptions(within(dialog).getByLabelText("Falta"), "L-a");

    await userEvent.click(within(dialog).getByRole("button", { name: "Registrar" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Puede que la falta se haya registrado. Revisa la lista antes de volver a intentarlo",
    );
  });

  it("pide la fecha si se deja vacía y no deja elegir una futura", async () => {
    const server = api();
    renderWithAuth(<PuntosPage />);
    const dialog = await openForm();
    const date = within(dialog).getByLabelText("Fecha");

    expect(date).toHaveAttribute("max", "2026-10-21");
    await userEvent.clear(date);
    await userEvent.click(within(dialog).getByRole("button", { name: "Registrar" }));

    expect(within(dialog).getByText("Indica la fecha")).toBeInTheDocument();
    expect(server.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("avisa de la semana a la que se aplica una falta de otra semana", async () => {
    api({
      "POST /movements/infractions": () => ({
        data: registered({ movement: { ...MOVEMENT, id: "m3", applies_week: "2026-10-26" } }),
      }),
    });
    renderWithAuth(<PuntosPage />);
    const dialog = await openForm();
    await userEvent.selectOptions(within(dialog).getByLabelText("Jugador"), "p1");
    await userEvent.selectOptions(within(dialog).getByLabelText("Falta"), "L-a");

    await userEvent.click(within(dialog).getByRole("button", { name: "Registrar" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Se aplica a la semana del 26 oct – 1 nov 2026");
  });

  it("deshacer permite cancelar la confirmación", async () => {
    const server = api();
    renderWithAuth(<PuntosPage />);
    await screen.findByText("Ana Ruiz");
    await userEvent.click(screen.getByRole("button", { name: "Deshacer Ana Ruiz: Falta de atención e implicación" }));

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(
      screen.getByRole("button", { name: "Deshacer Ana Ruiz: Falta de atención e implicación" }),
    ).toBeInTheDocument();
    expect(server.calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  it("deshacer distingue por jugador y un 404 cuenta como ya deshecho", async () => {
    const server = api({
      "DELETE /movements/m1": { status: 404, error: { code: "not_found", message: "Movimiento no encontrado" } },
    });
    renderWithAuth(<PuntosPage />);
    await screen.findByText("Ana Ruiz");
    expect(screen.getByRole("button", { name: "Deshacer Zoe Baja: Partidillo final ganado" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Deshacer Ana Ruiz: Falta de atención e implicación" }));

    await userEvent.click(screen.getByRole("button", { name: "Confirmar deshacer" }));

    await waitFor(() => expect(server.count("DELETE", "/movements/m1")).toBe(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reintenta el registro con la misma clave de idempotencia y la cambia si cambia la falta", async () => {
    const keys: (string | null)[] = [];
    api({ "POST /movements/infractions": () => ({ data: registered() }) });
    renderWithAuth(<PuntosPage />);
    const dialog = await openForm();
    await userEvent.selectOptions(within(dialog).getByLabelText("Jugador"), "p1");
    await userEvent.selectOptions(within(dialog).getByLabelText("Falta"), "L-a");
    failFirstPosts(2, keys);

    await userEvent.click(within(dialog).getByRole("button", { name: "Registrar" }));
    await within(dialog).findByRole("alert");
    await userEvent.click(within(dialog).getByRole("button", { name: "Registrar" }));
    await waitFor(() => expect(keys).toHaveLength(2));
    await userEvent.selectOptions(within(dialog).getByLabelText("Falta"), "G-h");
    await userEvent.click(within(dialog).getByRole("button", { name: "Registrar" }));

    await waitFor(() => expect(keys).toHaveLength(3));
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("el segundo entrenador no ve la pantalla ni hace peticiones", () => {
    const server = api();

    renderWithAuth(<PuntosPage />, { user: fakeUser("assistant_coach") });

    expect(screen.getByText("Solo el entrenador puede gestionar los puntos")).toBeInTheDocument();
    expect(server.calls).toHaveLength(0);
  });
});
