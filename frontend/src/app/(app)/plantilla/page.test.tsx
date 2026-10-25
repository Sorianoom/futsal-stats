import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import type { Player } from "@/lib/api/types";
import { mockApi } from "@/test/mock-api";
import { fakeUser, renderWithAuth } from "@/test/render-with-auth";

import PlantillaPage from "./page";

const LUIS: Player = {
  id: "p1",
  name: "Luis Prado",
  dorsal: 1,
  position: "goalkeeper",
  status: "available",
  is_active: true,
};
const PEDRO: Player = {
  id: "p2",
  name: "Pedro Gómez",
  dorsal: 7,
  position: "field",
  status: "injured",
  is_active: true,
};

let roster: Player[];

beforeEach(() => {
  roster = [LUIS, PEDRO];
});

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({ "GET /players": () => ({ data: roster }), ...extra });
}

describe("PlantillaPage", () => {
  it("lista los jugadores con dorsal, posición y estado", async () => {
    api();

    renderWithAuth(<PlantillaPage />);

    expect(await screen.findByText("Luis Prado")).toBeInTheDocument();
    expect(screen.getByText("Pedro Gómez")).toBeInTheDocument();
    expect(screen.getByText("Portero")).toBeInTheDocument();
    expect(screen.getByText("Lesionado")).toBeInTheDocument();
    expect(screen.getByText("Disponible")).toBeInTheDocument();
  });

  it("indica cuando la plantilla está vacía", async () => {
    roster = [];
    api();

    renderWithAuth(<PlantillaPage />);

    expect(await screen.findByText("Todavía no hay jugadores")).toBeInTheDocument();
  });

  it("avisa si no se puede cargar la plantilla", async () => {
    mockApi({ "GET /players": { status: 500, error: { code: "internal_error", message: "Error" } } });

    renderWithAuth(<PlantillaPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar la plantilla");
  });

  it("el segundo entrenador solo puede ver la plantilla", async () => {
    api();

    renderWithAuth(<PlantillaPage />, { user: fakeUser("assistant_coach") });

    await screen.findByText("Luis Prado");
    expect(screen.queryByRole("button", { name: "Añadir jugador" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
  });

  it("el entrenador añade un jugador", async () => {
    const server = api({
      "POST /players": (request) => {
        const created = { ...(request.body as object), id: "p3", status: "available", is_active: true };
        roster = [...roster, created as Player];
        return { status: 201, data: created };
      },
    });
    renderWithAuth(<PlantillaPage />);
    await screen.findByText("Luis Prado");

    await userEvent.click(screen.getByRole("button", { name: "Añadir jugador" }));
    await userEvent.type(screen.getByLabelText("Nombre"), "Ana López");
    await userEvent.type(screen.getByLabelText("Dorsal"), "10");
    await userEvent.selectOptions(screen.getByLabelText("Posición"), "goalkeeper");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("Ana López")).toBeInTheDocument();
    expect(server.calls.find((c) => c.method === "POST")?.body).toEqual({
      name: "Ana López",
      dorsal: 10,
      position: "goalkeeper",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("muestra el error de dorsal repetido sin cerrar el formulario", async () => {
    api({
      "POST /players": {
        status: 409,
        error: { code: "conflict", message: "Ya existe un jugador con ese dorsal" },
      },
    });
    renderWithAuth(<PlantillaPage />);
    await screen.findByText("Luis Prado");

    await userEvent.click(screen.getByRole("button", { name: "Añadir jugador" }));
    await userEvent.type(screen.getByLabelText("Nombre"), "Ana López");
    await userEvent.type(screen.getByLabelText("Dorsal"), "7");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("Ya existe un jugador con ese dorsal")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("no envía el formulario sin nombre o con dorsal fuera de rango", async () => {
    const server = api();
    renderWithAuth(<PlantillaPage />);
    await screen.findByText("Luis Prado");

    await userEvent.click(screen.getByRole("button", { name: "Añadir jugador" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await userEvent.type(screen.getByLabelText("Nombre"), "Ana");
    await userEvent.type(screen.getByLabelText("Dorsal"), "150");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByText("Introduce un dorsal entre 0 y 99")).toBeInTheDocument();
    expect(server.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("indica cuántos jugadores hay en cada filtro y marca el activo", async () => {
    api();
    renderWithAuth(<PlantillaPage />);
    await screen.findByText("Luis Prado");

    expect(screen.getByRole("button", { name: "Todos 2" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Campo 1" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Porteros 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lesionados 1" })).toBeInTheDocument();
  });

  it("filtra la lista por posición y por lesionados", async () => {
    api();
    renderWithAuth(<PlantillaPage />);
    await screen.findByText("Luis Prado");

    await userEvent.click(screen.getByRole("button", { name: "Porteros 1" }));
    expect(screen.getByText("Luis Prado")).toBeInTheDocument();
    expect(screen.queryByText("Pedro Gómez")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Lesionados 1" }));
    expect(screen.getByText("Pedro Gómez")).toBeInTheDocument();
    expect(screen.queryByText("Luis Prado")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Todos 2" }));
    expect(screen.getByText("Luis Prado")).toBeInTheDocument();
    expect(screen.getByText("Pedro Gómez")).toBeInTheDocument();
  });

  it("avisa cuando el filtro no tiene jugadores", async () => {
    roster = [LUIS];
    api();
    renderWithAuth(<PlantillaPage />);
    await screen.findByText("Luis Prado");

    await userEvent.click(screen.getByRole("button", { name: "Lesionados 0" }));

    expect(screen.getByText("No hay jugadores con este filtro")).toBeInTheDocument();
  });

  it("el entrenador cambia el estado de un jugador", async () => {
    const server = api({
      "PATCH /players/p2": (request) => {
        roster = roster.map((p) => (p.id === "p2" ? { ...p, ...(request.body as object) } : p));
        return { data: roster[1] };
      },
    });
    renderWithAuth(<PlantillaPage />);
    await screen.findByText("Pedro Gómez");

    await userEvent.click(screen.getByRole("button", { name: "Editar Pedro Gómez" }));
    expect(screen.getByLabelText("Nombre")).toHaveValue("Pedro Gómez");
    await userEvent.selectOptions(screen.getByLabelText("Estado"), "available");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.queryByText("Lesionado")).not.toBeInTheDocument());
    expect(server.calls.find((c) => c.method === "PATCH")?.body).toMatchObject({
      status: "available",
    });
  });

  it("dar de baja pide confirmación antes de llamar a la API", async () => {
    const server = api({
      "DELETE /players/p1": () => {
        const [gone, ...rest] = roster;
        roster = rest;
        return { data: { ...gone, is_active: false } };
      },
    });
    renderWithAuth(<PlantillaPage />);
    await screen.findByText("Luis Prado");

    await userEvent.click(screen.getByRole("button", { name: "Editar Luis Prado" }));
    await userEvent.click(screen.getByRole("button", { name: "Dar de baja" }));
    expect(server.calls.some((c) => c.method === "DELETE")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Confirmar baja" }));

    await waitFor(() => expect(screen.queryByText("Luis Prado")).not.toBeInTheDocument());
    expect(server.count("DELETE", "/players/p1")).toBe(1);
  });

  it("un doble toque en 'Dar de baja' no confirma la baja", async () => {
    const server = api();
    renderWithAuth(<PlantillaPage />);
    await screen.findByText("Luis Prado");
    await userEvent.click(screen.getByRole("button", { name: "Editar Luis Prado" }));

    await userEvent.dblClick(screen.getByRole("button", { name: "Dar de baja" }));

    expect(server.calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(screen.getByRole("button", { name: "Confirmar baja" })).toBeInTheDocument();
  });

  it("si la baja falla vuelve a pedir confirmación y avisa del error", async () => {
    api({
      "DELETE /players/p1": { status: 500, error: { code: "internal_error", message: "Fallo" } },
    });
    renderWithAuth(<PlantillaPage />);
    await screen.findByText("Luis Prado");
    await userEvent.click(screen.getByRole("button", { name: "Editar Luis Prado" }));
    await userEvent.click(screen.getByRole("button", { name: "Dar de baja" }));

    await userEvent.click(screen.getByRole("button", { name: "Confirmar baja" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Fallo");
    expect(screen.getByRole("button", { name: "Dar de baja" })).toBeInTheDocument();
  });

  it("anuncia los errores de campo y marca el campo como inválido", async () => {
    api();
    renderWithAuth(<PlantillaPage />);
    await screen.findByText("Luis Prado");
    await userEvent.click(screen.getByRole("button", { name: "Añadir jugador" }));

    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    const name = screen.getByLabelText("Nombre");
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription("Escribe el nombre");
  });
});
