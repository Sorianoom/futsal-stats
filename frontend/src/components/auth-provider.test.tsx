import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiData, getAccessToken, setAccessToken, setUnauthorizedHandler } from "@/lib/api/client";
import { mockApi } from "@/test/mock-api";

import { AuthProvider, useAuth } from "./auth-provider";

const USER = { id: "u1", email: "coach@club.es", role: "head_coach" };

function Probe() {
  const { user, status, login, logout, retry } = useAuth();
  const [error, setError] = useState("");
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="email">{user?.email ?? "-"}</p>
      <p role="alert">{error}</p>
      <button onClick={() => login("coach@club.es", "secreto").catch((e: Error) => setError(e.message))}>
        entrar
      </button>
      <button onClick={() => logout().catch((e: Error) => setError(e.message))}>salir</button>
      <button onClick={() => void retry()}>reintentar</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

beforeEach(() => {
  setAccessToken(null);
  setUnauthorizedHandler(null);
});

describe("AuthProvider", () => {
  it("restaura la sesión al arrancar si hay cookie de refresco válida", async () => {
    mockApi({
      "POST /auth/refresh": { data: { access_token: "tok" } },
      "GET /auth/me": { data: USER },
    });

    renderProbe();

    expect(screen.getByTestId("status")).toHaveTextContent("loading");
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(screen.getByTestId("email")).toHaveTextContent("coach@club.es");
    expect(getAccessToken()).toBe("tok");
  });

  it("queda anónimo si no hay sesión que restaurar", async () => {
    mockApi({ "POST /auth/refresh": { status: 401, error: { code: "unauthorized", message: "No" } } });

    renderProbe();

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(screen.getByTestId("email")).toHaveTextContent("-");
  });

  it("inicia sesión con email y contraseña", async () => {
    const api = mockApi({
      "POST /auth/refresh": { status: 401, error: { code: "unauthorized", message: "No" } },
      "POST /auth/login": {
        data: { access_token: "nuevo", token_type: "bearer", expires_in: 900, user: USER },
      },
    });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));

    await userEvent.click(screen.getByRole("button", { name: "entrar" }));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(api.calls.find((c) => c.path === "/auth/login")?.body).toEqual({
      email: "coach@club.es",
      password: "secreto",
    });
    expect(getAccessToken()).toBe("nuevo");
  });

  it("propaga el error de credenciales y sigue anónimo", async () => {
    mockApi({
      "POST /auth/refresh": { status: 401, error: { code: "unauthorized", message: "No" } },
      "POST /auth/login": {
        status: 401,
        error: { code: "invalid_credentials", message: "Email o contraseña incorrectos" },
      },
    });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));

    await userEvent.click(screen.getByRole("button", { name: "entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email o contraseña incorrectos");
    expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
  });

  it("cierra la sesión y borra el token cuando el servidor lo confirma", async () => {
    mockApi({
      "POST /auth/refresh": { data: { access_token: "tok" } },
      "GET /auth/me": { data: USER },
      "POST /auth/logout": { data: null },
    });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    await userEvent.click(screen.getByRole("button", { name: "salir" }));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(getAccessToken()).toBeNull();
  });

  it("si el servidor no confirma el cierre, la sesión sigue abierta y se avisa", async () => {
    mockApi({
      "POST /auth/refresh": { data: { access_token: "tok" } },
      "GET /auth/me": { data: USER },
      "POST /auth/logout": { status: 500, error: { code: "internal_error", message: "Error" } },
    });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    await userEvent.click(screen.getByRole("button", { name: "salir" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Error");
    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    expect(getAccessToken()).toBe("tok");
  });

  it("sin red al arrancar queda sin conexión y no pasa a anónimo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    renderProbe();

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("offline"));
  });

  it("reintenta la restauración al volver la red", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("offline"));
    mockApi({
      "POST /auth/refresh": { data: { access_token: "tok" } },
      "GET /auth/me": { data: USER },
    });

    window.dispatchEvent(new Event("online"));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
  });

  it("permite reintentar a mano y pasa a anónimo si el servidor rechaza la sesión", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("offline"));
    mockApi({ "POST /auth/refresh": { status: 401, error: { code: "unauthorized", message: "No" } } });

    await userEvent.click(screen.getByRole("button", { name: "reintentar" }));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
  });

  it("pasa a anónimo cuando una petición descubre que la sesión caducó", async () => {
    let refreshWorks = true;
    mockApi({
      "POST /auth/refresh": () =>
        refreshWorks
          ? { data: { access_token: "tok" } }
          : { status: 401, error: { code: "unauthorized", message: "No" } },
      "GET /auth/me": { data: USER },
      "GET /players": { status: 401, error: { code: "unauthorized", message: "Caducado" } },
    });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    refreshWorks = false;

    await apiData("/players").catch(() => undefined);

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
  });

  it("useAuth fuera del proveedor es un error de programación", () => {
    function Orphan() {
      useAuth();
      return null;
    }

    expect(() => render(<Orphan />)).toThrow(/AuthProvider/);
  });
});
