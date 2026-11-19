import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import { mockApi, type MockReply } from "@/test/mock-api";
import { renderWithAuth } from "@/test/render-with-auth";

import InvitacionPage from "./page";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const CREATED = { id: "u9", email: "ana@club.es", role: "player", player_id: "p1" };

/** Simula abrir la página con esta URL (ruta, query y fragmento). */
function openAt(url: string) {
  window.history.replaceState(null, "", url);
}

beforeEach(() => {
  router.replace.mockClear();
  openAt("/invitacion/#token=tok-123");
});

function renderPage(login = vi.fn().mockResolvedValue(undefined)) {
  return renderWithAuth(<InvitacionPage />, { user: null, status: "anonymous", login });
}

async function fillForm(password = "una-clave-larga", repeated = password) {
  await userEvent.type(await screen.findByLabelText("Correo electrónico"), "ana@club.es");
  await userEvent.type(screen.getByLabelText("Contraseña"), password);
  await userEvent.type(screen.getByLabelText("Repite la contraseña"), repeated);
  await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
}

function acceptReplying(reply: MockReply) {
  return mockApi({ "POST /auth/invitations/accept": reply });
}

describe("InvitacionPage", () => {
  it("crea la cuenta, inicia sesión con esas credenciales y lleva al Fantasy", async () => {
    const server = acceptReplying({ status: 201, data: CREATED });
    const login = vi.fn().mockResolvedValue(undefined);
    renderPage(login);

    await fillForm();

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/fantasy"));
    expect(server.calls[0].body).toEqual({
      token: "tok-123",
      email: "ana@club.es",
      password: "una-clave-larga",
    });
    expect(server.calls[0].headers.get("Authorization")).toBeNull();
    expect(login).toHaveBeenCalledWith("ana@club.es", "una-clave-larga");
  });

  it("no envía nada si las contraseñas no coinciden", async () => {
    const server = acceptReplying({ status: 201, data: CREATED });
    renderPage();

    await fillForm("una-clave-larga", "otra-clave-larga");

    expect(screen.getByRole("alert")).toHaveTextContent("Las contraseñas no coinciden");
    expect(server.calls).toHaveLength(0);
  });

  it("lee el token del fragmento y lo quita de la barra de direcciones sin recargar", async () => {
    const server = acceptReplying({ status: 201, data: CREATED });
    openAt("/invitacion/#token=tok%2F%2B%3D9");
    renderPage();

    expect(await screen.findByLabelText("Correo electrónico")).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/invitacion/");
    await fillForm();

    await waitFor(() => expect(server.calls).toHaveLength(1));
    expect(server.calls[0].body).toMatchObject({ token: "tok/+=9" });
  });

  it("acepta todavía los enlaces antiguos con ?token= y también lo quita de la barra", async () => {
    const server = acceptReplying({ status: 201, data: CREATED });
    openAt("/invitacion/?token=tok-viejo");
    renderPage();

    expect(await screen.findByLabelText("Correo electrónico")).toBeInTheDocument();
    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/invitacion/");
    await fillForm();

    await waitFor(() => expect(server.calls).toHaveLength(1));
    expect(server.calls[0].body).toMatchObject({ token: "tok-viejo" });
  });

  it("si hay token en el fragmento y en la query manda el del fragmento", async () => {
    const server = acceptReplying({ status: 201, data: CREATED });
    openAt("/invitacion/?token=tok-viejo#token=tok-nuevo");
    renderPage();

    await fillForm();

    await waitFor(() => expect(server.calls).toHaveLength(1));
    expect(server.calls[0].body).toMatchObject({ token: "tok-nuevo" });
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
  });

  it("sin token en el enlace explica qué hacer y no muestra el formulario", async () => {
    openAt("/invitacion/");
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Al enlace le falta el código de invitación");
    expect(screen.queryByRole("button", { name: "Crear cuenta" })).not.toBeInTheDocument();
  });

  it.each([
    [
      "una invitación usada, caducada o desconocida",
      { status: 400, error: { code: "invalid_invitation", message: "Invitación no válida" } },
      "Esta invitación no es válida o ha caducado. Pide al entrenador un enlace nuevo.",
    ],
    [
      "un correo ya registrado",
      { status: 409, error: { code: "email_taken", message: "Correo en uso" } },
      "Ya hay una cuenta con ese correo. Usa otro.",
    ],
    [
      "una contraseña débil",
      {
        status: 422,
        error: { code: "weak_password", message: "La contraseña debe tener al menos 12 caracteres" },
      },
      "La contraseña debe tener al menos 12 caracteres.",
    ],
    [
      "un correo no válido",
      { status: 422, error: { code: "validation_error", message: "Datos no válidos: email" } },
      "El correo electrónico no es válido.",
    ],
    [
      "un fallo del servidor",
      { status: 500, error: { code: "internal_error", message: "Error" } },
      "No se pudo crear la cuenta. Inténtalo de nuevo.",
    ],
    [
      "demasiados intentos seguidos",
      { status: 429, error: { code: "too_many_attempts", message: "Demasiados intentos" } },
      "Demasiados intentos. Espera unos minutos y vuelve a probar.",
    ],
  ])("explica %s", async (_label, reply, message) => {
    acceptReplying(reply);
    const login = vi.fn();
    renderPage(login);

    await fillForm();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(login).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("si la cuenta se crea pero el inicio de sesión falla, manda al login", async () => {
    acceptReplying({ status: 201, data: CREATED });
    const login = vi.fn().mockRejectedValue(new ApiError(0, "network", "Sin conexión con el servidor"));
    renderPage(login);

    await fillForm();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tu cuenta está creada, pero no se pudo iniciar sesión.",
    );
    expect(screen.getByRole("link", { name: "Ir al inicio de sesión" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("button", { name: "Crear cuenta" })).not.toBeInTheDocument();
  });
});
