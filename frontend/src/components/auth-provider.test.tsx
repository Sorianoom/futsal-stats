import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiData, getAccessToken, setAccessToken, setUnauthorizedHandler } from "@/lib/api/client";
import type { User } from "@/lib/api/types";
import { loadSnapshot, saveSnapshot } from "@/lib/match/match-cache";
import { EMPTY_OUTBOX } from "@/lib/match/outbox";
import { loadOutbox, saveOutbox } from "@/lib/match/outbox-store";
import { loadSavedUser, saveUser } from "@/lib/saved-user";
import { mockApi } from "@/test/mock-api";

import { AuthProvider, useAuth } from "./auth-provider";

const USER: User = { id: "u1", email: "coach@club.es", role: "head_coach" };

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

const COPY = {
  match: { id: "m1", session_id: "s1", held_on: "2026-10-20", opponent: "Rival FS" },
  lineup: [],
  events: [],
  stints: [],
  players: [],
  proposed: [],
};
const PENDING = { ...EMPTY_OUTBOX, ratings: [{ id: "r1", part: 1, t: 10, stars: 4 }] };

function cutNetwork() {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
}

beforeEach(() => {
  setAccessToken(null);
  setUnauthorizedHandler(null);
  window.localStorage.clear();
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

    await act(async () => {}); // vacía los efectos pendientes: el listener ya está puesto
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

  it("guarda el usuario al restaurar la sesión, sin ningún token", async () => {
    mockApi({
      "POST /auth/refresh": { data: { access_token: "tok-secreto" } },
      "GET /auth/me": { data: USER },
    });

    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    expect(loadSavedUser()).toEqual(USER);
    expect(JSON.stringify({ ...window.localStorage })).not.toContain("tok-secreto");
  });

  it("guarda el usuario al iniciar sesión", async () => {
    mockApi({
      "POST /auth/refresh": { status: 401, error: { code: "unauthorized", message: "No" } },
      "POST /auth/login": {
        data: { access_token: "nuevo", token_type: "bearer", expires_in: 900, user: USER },
      },
    });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));

    await userEvent.click(screen.getByRole("button", { name: "entrar" }));

    await waitFor(() => expect(loadSavedUser()).toEqual(USER));
  });

  it("sin red y con un usuario guardado entra como autenticado, sin token", async () => {
    saveUser(USER);
    cutNetwork();

    renderProbe();

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(screen.getByTestId("email")).toHaveTextContent("coach@club.es");
    expect(getAccessToken()).toBeNull();
  });

  it("al volver la red sustituye la sesión sin conexión por la real", async () => {
    saveUser(USER);
    cutNetwork();
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    mockApi({
      "POST /auth/refresh": { data: { access_token: "tok" } },
      "GET /auth/me": { data: USER },
    });

    await act(async () => {});
    window.dispatchEvent(new Event("online"));

    await waitFor(() => expect(getAccessToken()).toBe("tok"));
  });

  it("si al volver la red el servidor rechaza la sesión, se cierra y se borra lo local", async () => {
    saveUser(USER);
    await saveSnapshot("m1", COPY);
    cutNetwork();
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    mockApi({ "POST /auth/refresh": { status: 401, error: { code: "unauthorized", message: "No" } } });

    await act(async () => {});
    window.dispatchEvent(new Event("online"));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(loadSavedUser()).toBeNull();
    expect(await loadSnapshot("m1")).toBeNull();
  });

  it("si el servidor rechaza la sesión al arrancar, olvida el usuario y las copias", async () => {
    saveUser(USER);
    await saveSnapshot("m1", COPY);
    mockApi({ "POST /auth/refresh": { status: 401, error: { code: "unauthorized", message: "No" } } });

    renderProbe();

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(loadSavedUser()).toBeNull();
    expect(await loadSnapshot("m1")).toBeNull();
  });

  it("al cerrar sesión borra el usuario y las copias, pero nunca lo anotado sin enviar", async () => {
    await saveSnapshot("m1", COPY);
    await saveOutbox("m1", PENDING);
    mockApi({
      "POST /auth/refresh": { data: { access_token: "tok" } },
      "GET /auth/me": { data: USER },
      "POST /auth/logout": { data: null },
    });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    await userEvent.click(screen.getByRole("button", { name: "salir" }));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(loadSavedUser()).toBeNull();
    expect(await loadSnapshot("m1")).toBeNull();
    expect(await loadOutbox("m1")).toEqual(PENDING);
  });

  it("si no se confirma el cierre, conserva el usuario y las copias", async () => {
    saveUser(USER);
    await saveSnapshot("m1", COPY);
    mockApi({
      "POST /auth/refresh": { data: { access_token: "tok" } },
      "GET /auth/me": { data: USER },
      "POST /auth/logout": { status: 500, error: { code: "internal_error", message: "Error" } },
    });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    await userEvent.click(screen.getByRole("button", { name: "salir" }));

    await screen.findByRole("alert");
    expect(loadSavedUser()).toEqual(USER);
    expect(await loadSnapshot("m1")).not.toBeNull();
  });

  it("un fallo del servidor que no es un 401 no borra el usuario ni las copias", async () => {
    saveUser(USER);
    await saveSnapshot("m1", COPY);
    mockApi({ "POST /auth/refresh": { status: 429, error: { code: "rate_limited", message: "Calma" } } });

    renderProbe();

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(loadSavedUser()).toEqual(USER);
    expect(await loadSnapshot("m1")).not.toBeNull();
  });

  it("un 500 del servidor al restaurar se trata como falta de conexión", async () => {
    saveUser(USER);
    mockApi({ "POST /auth/refresh": { status: 500, error: { code: "internal_error", message: "Error" } } });

    renderProbe();

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(getAccessToken()).toBeNull();
  });

  it("al iniciar sesión otro usuario se borran las copias del anterior", async () => {
    mockApi({
      "POST /auth/refresh": { status: 401, error: { code: "unauthorized", message: "No" } },
      "POST /auth/login": {
        data: {
          access_token: "nuevo",
          token_type: "bearer",
          expires_in: 900,
          user: { id: "u2", email: "otra@club.es", role: "assistant_coach" },
        },
      },
    });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    // Un cierre de sesión anterior que no pudo borrar las copias.
    saveUser(USER);
    await saveSnapshot("m1", COPY);

    await userEvent.click(screen.getByRole("button", { name: "entrar" }));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(await loadSnapshot("m1")).toBeNull();
    expect(loadSavedUser()?.id).toBe("u2");
  });

  it("al iniciar sesión el mismo usuario conserva sus copias", async () => {
    mockApi({
      "POST /auth/refresh": { status: 401, error: { code: "unauthorized", message: "No" } },
      "POST /auth/login": {
        data: { access_token: "nuevo", token_type: "bearer", expires_in: 900, user: USER },
      },
    });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    saveUser(USER);
    await saveSnapshot("m1", COPY);

    await userEvent.click(screen.getByRole("button", { name: "entrar" }));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(await loadSnapshot("m1")).not.toBeNull();
  });

  it("al restaurar la sesión de otro usuario se borran las copias del anterior", async () => {
    saveUser(USER);
    await saveSnapshot("m1", COPY);
    mockApi({
      "POST /auth/refresh": { data: { access_token: "tok" } },
      "GET /auth/me": { data: { id: "u2", email: "otra@club.es", role: "assistant_coach" } },
    });

    renderProbe();

    await waitFor(() => expect(screen.getByTestId("email")).toHaveTextContent("otra@club.es"));
    expect(await loadSnapshot("m1")).toBeNull();
  });

  it("sin red y sin usuario guardado sigue sin conexión, como antes", async () => {
    cutNetwork();

    renderProbe();

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("offline"));
  });

  it("useAuth fuera del proveedor es un error de programación", () => {
    function Orphan() {
      useAuth();
      return null;
    }

    expect(() => render(<Orphan />)).toThrow(/AuthProvider/);
  });
});
