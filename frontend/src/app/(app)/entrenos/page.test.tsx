import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AttendanceRecord, AttendanceSaved, Player, TeamSession } from "@/lib/api/types";
import { mockApi, type MockHandler } from "@/test/mock-api";
import { fakeUser, renderWithAuth } from "@/test/render-with-auth";

import EntrenosPage from "./page";

const PLAYERS: Player[] = [
  { id: "p1", name: "Ana Ruiz", dorsal: 9, position: "field", status: "available", is_active: true },
  { id: "p2", name: "Bea Soto", dorsal: 7, position: "field", status: "available", is_active: true },
];
const SESSION: TeamSession = { id: "s1", kind: "training", held_on: "2026-10-20", notes: "Táctica" };

let sessions: TeamSession[];
let attendance: AttendanceRecord[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T10:00:00Z"));
  sessions = [SESSION];
  attendance = [];
});

afterEach(() => {
  vi.useRealTimers();
});

function api(extra: Record<string, MockHandler> = {}) {
  return mockApi({
    "GET /players": { data: PLAYERS },
    "GET /sessions": () => ({ data: sessions }),
    "GET /sessions/s1/attendance": () => ({ data: attendance }),
    "GET /movements": { data: [] },
    ...extra,
  });
}

const saved = (proposals: AttendanceSaved["proposals"] = []): MockHandler => ({
  data: { saved: 2, proposals },
});

async function openAttendance() {
  await screen.findByText("Táctica");
  await userEvent.click(screen.getByRole("button", { name: "Pasar lista: Entreno 20 oct" }));
  const dialog = screen.getByRole("dialog");
  await within(dialog).findByText("Ana Ruiz");
  return dialog;
}

describe("EntrenosPage", () => {
  it("lista las sesiones de la semana con tipo, fecha y notas", async () => {
    const server = api();

    renderWithAuth(<EntrenosPage />);

    const list = await screen.findByRole("list", { name: "Sesiones" });
    expect(server.calls.some((c) => c.path === "/sessions?week=2026-10-19")).toBe(true);
    expect(within(list).getByText("Entreno")).toBeInTheDocument();
    expect(within(list).getByText("20 oct")).toBeInTheDocument();
    expect(within(list).getByText("Táctica")).toBeInTheDocument();
  });

  it("indica cuando no hay sesiones y cambia de semana", async () => {
    sessions = [];
    const server = api();
    renderWithAuth(<EntrenosPage />);

    expect(await screen.findByText("No hay sesiones esta semana")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Semana anterior" }));

    await waitFor(() =>
      expect(server.calls.some((c) => c.path === "/sessions?week=2026-10-12")).toBe(true),
    );
  });

  it("avisa si no se pueden cargar y permite reintentar", async () => {
    api({ "GET /sessions": { status: 500, error: { code: "internal_error", message: "Fallo" } } });
    renderWithAuth(<EntrenosPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar las sesiones");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("crea una sesión con la fecha de hoy y recarga la lista", async () => {
    const server = api({ "POST /sessions": () => ({ data: { ...SESSION, id: "s2", kind: "match" } }) });
    renderWithAuth(<EntrenosPage />);
    await screen.findByText("Táctica");
    await userEvent.click(screen.getByRole("button", { name: "Nueva sesión" }));
    const dialog = screen.getByRole("dialog");

    await userEvent.selectOptions(within(dialog).getByLabelText("Tipo"), "match");
    await userEvent.type(within(dialog).getByLabelText("Notas (opcional)"), "  Contra el Betis ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crear" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(server.calls.find((c) => c.method === "POST")?.body).toEqual({
      kind: "match",
      held_on: "2026-10-21",
      notes: "Contra el Betis",
    });
    expect(server.count("GET", "/sessions")).toBe(2);
  });

  it("envía notas nulas si se dejan vacías y pide la fecha si se borra", async () => {
    const server = api({ "POST /sessions": () => ({ data: SESSION }) });
    renderWithAuth(<EntrenosPage />);
    await screen.findByText("Táctica");
    await userEvent.click(screen.getByRole("button", { name: "Nueva sesión" }));
    const dialog = screen.getByRole("dialog");

    await userEvent.clear(within(dialog).getByLabelText("Fecha"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Crear" }));
    expect(within(dialog).getByText("Indica la fecha")).toBeInTheDocument();
    expect(server.calls.some((c) => c.method === "POST")).toBe(false);

    await userEvent.type(within(dialog).getByLabelText("Fecha"), "2026-10-22");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crear" }));

    await waitFor(() => expect(server.calls.some((c) => c.method === "POST")).toBe(true));
    expect(server.calls.find((c) => c.method === "POST")?.body).toMatchObject({
      held_on: "2026-10-22",
      notes: null,
    });
  });

  it("pasa lista con todos como asistentes por defecto y guarda los registros", async () => {
    const server = api({ "PUT /sessions/s1/attendance": saved() });
    renderWithAuth(<EntrenosPage />);
    const dialog = await openAttendance();

    await userEvent.selectOptions(within(dialog).getByLabelText("Estado de Bea Soto"), "late");
    await userEvent.type(within(dialog).getByLabelText("Minutos de retraso de Bea Soto"), "20");
    await userEvent.click(within(dialog).getByLabelText("Avisó Bea Soto"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar lista" }));

    expect(await within(dialog).findByText("Lista guardada")).toBeInTheDocument();
    expect(server.calls.find((c) => c.method === "PUT")?.body).toEqual({
      records: [
        { player_id: "p1", status: "attended", notified: false, minutes_late: 0 },
        { player_id: "p2", status: "late", notified: true, minutes_late: 20 },
      ],
    });
  });

  it("solo pide los minutos de retraso cuando llegó tarde", async () => {
    api();
    renderWithAuth(<EntrenosPage />);
    const dialog = await openAttendance();

    expect(within(dialog).queryByLabelText("Minutos de retraso de Ana Ruiz")).not.toBeInTheDocument();
    await userEvent.selectOptions(within(dialog).getByLabelText("Estado de Ana Ruiz"), "late");

    expect(within(dialog).getByLabelText("Minutos de retraso de Ana Ruiz")).toBeInTheDocument();
  });

  it("muestra la lista ya guardada de la sesión", async () => {
    attendance = [{ player_id: "p2", status: "justified", notified: true, minutes_late: 0 }];
    api();
    renderWithAuth(<EntrenosPage />);
    const dialog = await openAttendance();

    expect(within(dialog).getByLabelText("Estado de Bea Soto")).toHaveValue("justified");
    expect(within(dialog).getByLabelText("Avisó Bea Soto")).toBeChecked();
    expect(within(dialog).getByLabelText("Estado de Ana Ruiz")).toHaveValue("attended");
  });

  it("acepta una falta propuesta y la registra en la sesión", async () => {
    const server = api({
      "PUT /sessions/s1/attendance": saved([
        {
          player_id: "p2",
          infraction_code: "G-c",
          description: "Llegar más de 15 minutos tarde a un entrenamiento",
          points: -5,
          sanction: { kind: "no_callup", min_matches: 1, max_matches: 1 },
        },
      ]),
      "POST /movements/infractions": () => ({
        data: { movement: { id: "m1" }, escalations: [], sanction: null },
      }),
    });
    renderWithAuth(<EntrenosPage />);
    const dialog = await openAttendance();
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar lista" }));

    const proposal = (await within(dialog).findByText("Bea Soto")).closest("li") as HTMLElement;
    expect(within(proposal).getByText(/Llegar más de 15 minutos tarde/)).toBeInTheDocument();
    expect(within(proposal).getByText(/Sin convocatoria \(1 partido\)/)).toBeInTheDocument();
    await userEvent.click(within(proposal).getByRole("button", { name: "Aceptar falta de Bea Soto" }));

    expect(await within(proposal).findByText("Registrada")).toBeInTheDocument();
    expect(server.calls.find((c) => c.path === "/movements/infractions")?.body).toEqual({
      player_id: "p2",
      infraction_code: "G-c",
      occurred_on: "2026-10-20",
      session_id: "s1",
      in_match: false,
    });
    expect(
      within(proposal).queryByRole("button", { name: "Aceptar falta de Bea Soto" }),
    ).not.toBeInTheDocument();
  });

  it("descarta una falta propuesta sin registrarla", async () => {
    const server = api({
      "PUT /sessions/s1/attendance": saved([
        { player_id: "p1", infraction_code: "G-a", description: "No asistir", points: -5, sanction: null },
      ]),
    });
    renderWithAuth(<EntrenosPage />);
    const dialog = await openAttendance();
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar lista" }));
    await within(dialog).findByText(/No asistir/);

    await userEvent.click(within(dialog).getByRole("button", { name: "Descartar falta de Ana Ruiz" }));

    expect(within(dialog).queryByText(/No asistir/)).not.toBeInTheDocument();
    expect(server.calls.some((c) => c.path === "/movements/infractions")).toBe(false);
  });

  it("avisa si no se puede aceptar la falta y permite volver a intentarlo", async () => {
    api({
      "PUT /sessions/s1/attendance": saved([
        { player_id: "p1", infraction_code: "G-a", description: "No asistir", points: -5, sanction: null },
      ]),
      "POST /movements/infractions": { status: 500, error: { code: "internal_error", message: "Fallo" } },
    });
    renderWithAuth(<EntrenosPage />);
    const dialog = await openAttendance();
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar lista" }));
    await within(dialog).findByText(/No asistir/);

    await userEvent.click(within(dialog).getByRole("button", { name: "Aceptar falta de Ana Ruiz" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("No se pudo registrar la falta");
    expect(within(dialog).getByRole("button", { name: "Aceptar falta de Ana Ruiz" })).toBeEnabled();
  });

  it("mantiene la lista abierta y avisa si no se puede guardar", async () => {
    api({ "PUT /sessions/s1/attendance": { status: 500, error: { code: "internal_error", message: "Fallo" } } });
    renderWithAuth(<EntrenosPage />);
    const dialog = await openAttendance();

    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar lista" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Fallo");
    expect(within(dialog).getByRole("button", { name: "Guardar lista" })).toBeEnabled();
  });

  it("registra victorias de entreno para los jugadores elegidos", async () => {
    const server = api({ "POST /sessions/s1/wins": () => ({ data: { movements: [] } }) });
    renderWithAuth(<EntrenosPage />);
    await screen.findByText("Táctica");
    await userEvent.click(screen.getByRole("button", { name: "Victorias: Entreno 20 oct" }));
    const dialog = screen.getByRole("dialog");

    await userEvent.selectOptions(within(dialog).getByLabelText("Tipo de victoria"), "scrimmage");
    await userEvent.click(within(dialog).getByLabelText("Ana Ruiz"));
    await userEvent.click(within(dialog).getByLabelText("Bea Soto"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Registrar" }));

    expect(await within(dialog).findByText("Victoria registrada para 2 jugadores")).toBeInTheDocument();
    expect(server.calls.find((c) => c.path === "/sessions/s1/wins")?.body).toEqual({
      kind: "scrimmage",
      player_ids: ["p1", "p2"],
    });
  });

  it("no registra victorias sin jugadores elegidos", async () => {
    const server = api();
    renderWithAuth(<EntrenosPage />);
    await screen.findByText("Táctica");
    await userEvent.click(screen.getByRole("button", { name: "Victorias: Entreno 20 oct" }));
    const dialog = screen.getByRole("dialog");

    await userEvent.click(within(dialog).getByRole("button", { name: "Registrar" }));

    expect(within(dialog).getByText("Elige al menos un jugador")).toBeInTheDocument();
    expect(server.calls.some((c) => c.path === "/sessions/s1/wins")).toBe(false);
  });

  it("no deja cerrar el diálogo mientras se guarda la lista", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    api({ "PUT /sessions/s1/attendance": saved() });
    renderWithAuth(<EntrenosPage />);
    const dialog = await openAttendance();
    const original = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PUT") await gate;
        return original(input, init);
      }),
    );

    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar lista" }));
    await userEvent.keyboard("{Escape}");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Guardar lista" })).toBeDisabled();
    release();
    expect(await within(dialog).findByText("Lista guardada")).toBeInTheDocument();
  });

  it("al guardar la lista otra vez no ofrece aceptar una falta ya registrada", async () => {
    const server = api({
      "PUT /sessions/s1/attendance": saved([
        { player_id: "p2", infraction_code: "G-c", description: "Llegar tarde", points: -5, sanction: null },
      ]),
      "GET /movements": {
        data: [
          {
            id: "m1",
            player_id: "p2",
            occurred_on: "2026-10-20",
            points: -5,
            reason: "Llegar tarde",
            applies_week: "2026-10-19",
            session_id: "s1",
            infraction_code: "G-c",
          },
        ],
      },
    });
    renderWithAuth(<EntrenosPage />);
    const dialog = await openAttendance();

    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar lista" }));

    const proposal = (await within(dialog).findByText("Bea Soto")).closest("li") as HTMLElement;
    expect(within(proposal).getByText("Ya registrada")).toBeInTheDocument();
    expect(
      within(proposal).queryByRole("button", { name: "Aceptar falta de Bea Soto" }),
    ).not.toBeInTheDocument();
    expect(server.calls.some((c) => c.path === "/movements?week=2026-10-19")).toBe(true);
  });

  it("si no puede comprobar las faltas ya registradas lo avisa antes de aceptar", async () => {
    api({
      "PUT /sessions/s1/attendance": saved([
        { player_id: "p2", infraction_code: "G-c", description: "Llegar tarde", points: -5, sanction: null },
      ]),
      "GET /movements": { status: 500, error: { code: "internal_error", message: "Fallo" } },
    });
    renderWithAuth(<EntrenosPage />);
    const dialog = await openAttendance();

    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar lista" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "No se pudo comprobar qué faltas ya estaban registradas",
    );
    expect(within(dialog).getByRole("button", { name: "Aceptar falta de Bea Soto" })).toBeEnabled();
  });

  it("si se corta la red al aceptar avisa de que puede haberse registrado", async () => {
    api({
      "PUT /sessions/s1/attendance": saved([
        { player_id: "p1", infraction_code: "G-a", description: "No asistir", points: -5, sanction: null },
      ]),
    });
    renderWithAuth(<EntrenosPage />);
    const dialog = await openAttendance();
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar lista" }));
    await within(dialog).findByText(/No asistir/);
    const original = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") throw new TypeError("Failed to fetch");
        return original(input, init);
      }),
    );

    await userEvent.click(within(dialog).getByRole("button", { name: "Aceptar falta de Ana Ruiz" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Puede que la falta se haya registrado. Revisa Puntos antes de volver a intentarlo",
    );
  });

  it("no deja cerrar el diálogo mientras se acepta una falta", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    api({
      "PUT /sessions/s1/attendance": saved([
        { player_id: "p1", infraction_code: "G-a", description: "No asistir", points: -5, sanction: null },
      ]),
      "POST /movements/infractions": () => ({
        data: { movement: { id: "m1" }, escalations: [], sanction: null },
      }),
    });
    renderWithAuth(<EntrenosPage />);
    const dialog = await openAttendance();
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar lista" }));
    await within(dialog).findByText(/No asistir/);
    const original = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") await gate;
        return original(input, init);
      }),
    );

    await userEvent.click(within(dialog).getByRole("button", { name: "Aceptar falta de Ana Ruiz" }));
    await userEvent.keyboard("{Escape}");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cerrar" })).toBeDisabled();
    release();
    expect(await within(dialog).findByText("Registrada")).toBeInTheDocument();
  });

  it("no deja pasar lista ni registrar victorias antes de cargar la plantilla", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    api();
    const original = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (new URL(String(input)).pathname === "/players") await gate;
        return original(input, init);
      }),
    );
    renderWithAuth(<EntrenosPage />);
    await screen.findByText("Táctica");

    expect(screen.getByRole("button", { name: "Pasar lista: Entreno 20 oct" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Victorias: Entreno 20 oct" })).toBeDisabled();
    release();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Pasar lista: Entreno 20 oct" })).toBeEnabled(),
    );
  });

  it("no pierde lo que se edita aunque la plantilla se recargue con el diálogo abierto", async () => {
    api();
    renderWithAuth(<EntrenosPage />);
    const dialog = await openAttendance();
    await userEvent.selectOptions(within(dialog).getByLabelText("Estado de Ana Ruiz"), "justified");

    window.dispatchEvent(new Event("focus"));
    await userEvent.click(within(dialog).getByLabelText("Avisó Bea Soto"));

    expect(within(dialog).getByLabelText("Estado de Ana Ruiz")).toHaveValue("justified");
    expect(within(dialog).getByLabelText("Avisó Bea Soto")).toBeChecked();
  });

  it("exige los minutos de retraso cuando alguien llegó tarde", async () => {
    const server = api();
    renderWithAuth(<EntrenosPage />);
    const dialog = await openAttendance();
    await userEvent.selectOptions(within(dialog).getByLabelText("Estado de Ana Ruiz"), "late");

    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar lista" }));

    expect(within(dialog).getByRole("alert")).toHaveTextContent("Indica los minutos de retraso de Ana Ruiz");
    expect(server.calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("si no se puede cargar la lista de la sesión avisa y no deja guardar", async () => {
    api({ "GET /sessions/s1/attendance": { status: 500, error: { code: "internal_error", message: "Fallo" } } });
    renderWithAuth(<EntrenosPage />);
    await screen.findByText("Táctica");

    await userEvent.click(screen.getByRole("button", { name: "Pasar lista: Entreno 20 oct" }));

    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("No se pudo cargar la lista");
    expect(within(dialog).getByRole("button", { name: "Guardar lista" })).toBeDisabled();
  });

  it("si se corta la red al registrar victorias avisa de que pueden haberse registrado", async () => {
    api();
    renderWithAuth(<EntrenosPage />);
    await screen.findByText("Táctica");
    await userEvent.click(screen.getByRole("button", { name: "Victorias: Entreno 20 oct" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByLabelText("Ana Ruiz"));
    const original = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") throw new TypeError("Failed to fetch");
        return original(input, init);
      }),
    );

    await userEvent.click(within(dialog).getByRole("button", { name: "Registrar" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Puede que las victorias se hayan registrado. Revisa Puntos antes de volver a intentarlo",
    );
  });

  it("si se corta la red al crear una sesión avisa de que puede haberse creado", async () => {
    api();
    renderWithAuth(<EntrenosPage />);
    await screen.findByText("Táctica");
    await userEvent.click(screen.getByRole("button", { name: "Nueva sesión" }));
    const dialog = screen.getByRole("dialog");
    const original = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") throw new TypeError("Failed to fetch");
        return original(input, init);
      }),
    );

    await userEvent.click(within(dialog).getByRole("button", { name: "Crear" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Puede que la sesión se haya creado. Revisa la lista antes de volver a intentarlo",
    );
  });

  it("salta a la semana de la sesión creada si cae en otra semana", async () => {
    const server = api({
      "POST /sessions": () => ({ data: { ...SESSION, id: "s3", held_on: "2026-10-28" } }),
    });
    renderWithAuth(<EntrenosPage />);
    await screen.findByText("Táctica");
    await userEvent.click(screen.getByRole("button", { name: "Nueva sesión" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.clear(within(dialog).getByLabelText("Fecha"));
    await userEvent.type(within(dialog).getByLabelText("Fecha"), "2026-10-28");

    await userEvent.click(within(dialog).getByRole("button", { name: "Crear" }));

    await waitFor(() =>
      expect(server.calls.some((c) => c.path === "/sessions?week=2026-10-26")).toBe(true),
    );
    expect(screen.getByText("26 oct – 1 nov 2026")).toBeInTheDocument();
  });

  it("el segundo entrenador no ve la pantalla ni hace peticiones", () => {
    const server = api();

    renderWithAuth(<EntrenosPage />, { user: fakeUser("assistant_coach") });

    expect(screen.getByText("Solo el entrenador puede gestionar los entrenos")).toBeInTheDocument();
    expect(server.calls).toHaveLength(0);
  });
});
