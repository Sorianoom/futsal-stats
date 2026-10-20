import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import { renderWithAuth } from "@/test/render-with-auth";

import LoginPage from "./page";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

async function fillAndSubmit(email: string, password: string) {
  await userEvent.type(screen.getByLabelText("Correo electrónico"), email);
  await userEvent.type(screen.getByLabelText("Contraseña"), password);
  await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("LoginPage", () => {
  it("envía las credenciales y entra en la app", async () => {
    const { value } = renderWithAuth(<LoginPage />, { user: null, status: "anonymous" });

    await fillAndSubmit("  coach@club.es ", "secreto");

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
    expect(value.login).toHaveBeenCalledWith("coach@club.es", "secreto");
  });

  it("muestra el mensaje del servidor si las credenciales son incorrectas", async () => {
    const login = vi
      .fn()
      .mockRejectedValue(new ApiError(401, "invalid_credentials", "Email o contraseña incorrectos"));
    router.replace.mockClear();
    renderWithAuth(<LoginPage />, { user: null, status: "anonymous", login });

    await fillAndSubmit("coach@club.es", "mala");

    expect(await screen.findByRole("alert")).toHaveTextContent("Email o contraseña incorrectos");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("avisa de que no hay conexión con el servidor", async () => {
    const login = vi.fn().mockRejectedValue(new ApiError(0, "network", "Sin conexión con el servidor"));
    renderWithAuth(<LoginPage />, { user: null, status: "anonymous", login });

    await fillAndSubmit("coach@club.es", "x");

    expect(await screen.findByRole("alert")).toHaveTextContent("Sin conexión");
  });

  it("bloquea el botón mientras se envía", async () => {
    let finish: () => void = () => undefined;
    const login = vi.fn().mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    renderWithAuth(<LoginPage />, { user: null, status: "anonymous", login });

    await fillAndSubmit("coach@club.es", "x");

    expect(screen.getByRole("button", { name: "Entrando…" })).toBeDisabled();
    finish();
  });

  it("no muestra el formulario mientras se restaura la sesión", () => {
    renderWithAuth(<LoginPage />, { user: null, status: "loading" });

    expect(screen.getByRole("status")).toHaveTextContent("Cargando");
    expect(screen.queryByLabelText("Correo electrónico")).not.toBeInTheDocument();
  });

  it("redirige al inicio si ya hay sesión", async () => {
    router.replace.mockClear();

    renderWithAuth(<LoginPage />);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
  });
});
