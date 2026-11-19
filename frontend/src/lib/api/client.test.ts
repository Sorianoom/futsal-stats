import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockApi } from "@/test/mock-api";

import {
  API_URL,
  ApiError,
  apiData,
  getAccessToken,
  isUnreachable,
  refreshAccessToken,
  setAccessToken,
  setUnauthorizedHandler,
} from "./client";

beforeEach(() => {
  setAccessToken(null);
  setUnauthorizedHandler(null);
});

describe("apiData", () => {
  it("devuelve data del envoltorio y envía el token y las cookies", async () => {
    setAccessToken("tok");
    const api = mockApi({ "GET /x": { data: { a: 1 } } });

    const result = await apiData<{ a: number }>("/x");

    expect(result).toEqual({ a: 1 });
    expect(api.calls[0].headers.get("Authorization")).toBe("Bearer tok");
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe(`${API_URL}/x`);
    expect(init?.credentials).toBe("include");
  });

  it("no envía Authorization si no hay token", async () => {
    const api = mockApi({ "GET /x": { data: 1 } });

    await apiData("/x");

    expect(api.calls[0].headers.has("Authorization")).toBe(false);
  });

  it("envía Idempotency-Key solo cuando se indica", async () => {
    const api = mockApi({ "POST /x": { data: null } });

    await apiData("/x", { method: "POST", body: {}, idempotencyKey: "clave-1" });
    await apiData("/x", { method: "POST", body: {} });

    expect(api.calls[0].headers.get("Idempotency-Key")).toBe("clave-1");
    expect(api.calls[1].headers.has("Idempotency-Key")).toBe(false);
  });

  it("serializa el cuerpo como JSON", async () => {
    const api = mockApi({ "POST /x": { data: null } });

    await apiData("/x", { method: "POST", body: { name: "Pedro" } });

    expect(api.calls[0].body).toEqual({ name: "Pedro" });
    expect(api.calls[0].headers.get("Content-Type")).toBe("application/json");
  });

  it("lanza ApiError con el código y el mensaje del servidor", async () => {
    mockApi({ "POST /players": { status: 409, error: { code: "conflict", message: "Ya existe" } } });

    const failure = await apiData("/players", { method: "POST", body: {} }).catch((e) => e);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status: 409, code: "conflict", message: "Ya existe" });
  });

  it("convierte un fallo de red en un ApiError sin conexión", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const failure = await apiData("/x").catch((e) => e);

    expect(failure).toMatchObject({ status: 0, code: "network" });
  });

  it("un 204 sin cuerpo es un éxito sin datos", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const result = await apiData("/x", { method: "DELETE" });

    expect(result).toBeUndefined();
  });

  it("trata una respuesta que no es JSON como respuesta inválida", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 502 })));

    const failure = await apiData("/x").catch((e) => e);

    expect(failure).toMatchObject({ status: 502, code: "bad_response" });
  });
});

describe("isUnreachable", () => {
  it.each([
    ["un corte de red", new ApiError(0, "network", "sin red")],
    ["una respuesta que no es del servidor", new ApiError(200, "bad_response", "html")],
    ["un 500", new ApiError(500, "server_error", "caído")],
    ["un 503", new ApiError(503, "unavailable", "mantenimiento")],
  ])("considera inalcanzable %s", (_label, failure) => {
    expect(isUnreachable(failure)).toBe(true);
  });

  it.each([
    ["un 404", new ApiError(404, "not_found", "no existe")],
    ["un 422", new ApiError(422, "validation", "inválido")],
    ["un 401", new ApiError(401, "unauthorized", "sin sesión")],
    ["un error cualquiera", new Error("boom")],
  ])("no considera inalcanzable %s", (_label, failure) => {
    expect(isUnreachable(failure)).toBe(false);
  });
});

describe("refreshAccessToken: qué cuenta como sesión rechazada", () => {
  it("un 401 es un rechazo: devuelve false", async () => {
    mockApi({ "POST /auth/refresh": { status: 401, error: { code: "unauthorized", message: "No" } } });

    await expect(refreshAccessToken()).resolves.toBe(false);
  });

  it.each([
    [429, "rate_limited"],
    [403, "forbidden"],
    [500, "internal_error"],
  ])("un %i no es un rechazo de la sesión: lanza para que no se dé por cerrada", async (status, code) => {
    mockApi({ "POST /auth/refresh": { status, error: { code, message: "Fallo" } } });

    await expect(refreshAccessToken()).rejects.toMatchObject({ status, code });
  });
});

describe("API_URL", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("falla al cargar en producción si falta NEXT_PUBLIC_API_URL", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.resetModules();

    await expect(import("./client")).rejects.toThrow(/NEXT_PUBLIC_API_URL/);
  });

  it("exige https en producción", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.club.es");
    vi.resetModules();

    await expect(import("./client")).rejects.toThrow(/https/);
  });

  it("usa la variable en producción cuando es https", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.club.es");
    vi.resetModules();

    const loaded = await import("./client");

    expect(loaded.API_URL).toBe("https://api.club.es");
  });
});

describe("renovación de sesión", () => {
  function sessionApi(validToken: string) {
    return mockApi({
      "POST /auth/refresh": () => ({ data: { access_token: validToken } }),
      "GET /players": (request) =>
        request.headers.get("Authorization") === `Bearer ${validToken}`
          ? { data: ["ok"] }
          : { status: 401, error: { code: "unauthorized", message: "Caducado" } },
    });
  }

  it("ante un 401 refresca una vez y reintenta", async () => {
    setAccessToken("viejo");
    const api = sessionApi("nuevo");

    const result = await apiData("/players");

    expect(result).toEqual(["ok"]);
    expect(getAccessToken()).toBe("nuevo");
    expect(api.count("POST", "/auth/refresh")).toBe(1);
    expect(api.count("GET", "/players")).toBe(2);
  });

  it("varias peticiones con 401 comparten un único refresco", async () => {
    setAccessToken("viejo");
    const api = sessionApi("nuevo");

    const results = await Promise.all([apiData("/players"), apiData("/players"), apiData("/players")]);

    expect(results).toEqual([["ok"], ["ok"], ["ok"]]);
    expect(api.count("POST", "/auth/refresh")).toBe(1);
  });

  it("si el refresco falla avisa de la sesión caducada y propaga el 401", async () => {
    const expired = vi.fn();
    setUnauthorizedHandler(expired);
    setAccessToken("viejo");
    mockApi({
      "POST /auth/refresh": { status: 401, error: { code: "unauthorized", message: "No" } },
      "GET /players": { status: 401, error: { code: "unauthorized", message: "Caducado" } },
    });

    const failure = await apiData("/players").catch((e) => e);

    expect(failure).toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
  });

  it("un 401 de una petición sin autenticación no intenta refrescar", async () => {
    const api = mockApi({
      "POST /auth/login": { status: 401, error: { code: "invalid_credentials", message: "Mal" } },
    });

    const failure = await apiData("/auth/login", { method: "POST", body: {}, auth: false }).catch(
      (e) => e,
    );

    expect(failure).toMatchObject({ code: "invalid_credentials" });
    expect(api.count("POST", "/auth/refresh")).toBe(0);
  });

  it("si el reintento tras renovar vuelve a dar 401 avisa de la sesión caducada", async () => {
    const expired = vi.fn();
    setUnauthorizedHandler(expired);
    setAccessToken("viejo");
    mockApi({
      "POST /auth/refresh": { data: { access_token: "nuevo" } },
      "GET /players": { status: 401, error: { code: "unauthorized", message: "Caducado" } },
    });

    const failure = await apiData("/players").catch((e) => e);

    expect(failure).toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
  });

  it("descarta un refresco en vuelo si se cerró la sesión mientras tanto", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await gate;
        return new Response(
          JSON.stringify({ success: true, data: { access_token: "tardio" }, error: null }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const pending = refreshAccessToken();
    setAccessToken(null);
    release();

    expect(await pending).toBe(false);
    expect(getAccessToken()).toBeNull();
  });

  it("refreshAccessToken devuelve false cuando no hay cookie válida", async () => {
    mockApi({ "POST /auth/refresh": { status: 401, error: { code: "unauthorized", message: "No" } } });

    expect(await refreshAccessToken()).toBe(false);
  });
});

describe("apiData con límite de espera", () => {
  it("pasa la señal a fetch y un corte por ella es un ApiError «timeout»", async () => {
    const hanging = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    vi.stubGlobal("fetch", hanging);
    const controller = new AbortController();

    const pending = apiData("/lento", { method: "POST", body: {}, signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ status: 0, code: "timeout" });
    expect(isUnreachable(await pending.catch((e: unknown) => e))).toBe(true);
  });
});
