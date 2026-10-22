import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { buildServiceWorker } from "./precache";

const ORIGIN = "https://app.test";
const PRECACHE = ["/", "/partido/", "/_next/static/chunks/app.js"];

type Listener = (event: unknown) => void;

/** Una caché mínima en memoria con la semántica que usa el worker. */
class FakeCache {
  readonly store = new Map<string, Response>();

  constructor(private readonly network: (url: string) => Promise<Response>) {}

  async addAll(urls: readonly string[]) {
    for (const url of urls) this.store.set(new URL(url, ORIGIN).href, await this.network(url));
  }

  async put(request: string | { url: string }, response: Response) {
    this.store.set(hrefOf(request), response);
  }

  async match(request: string | { url: string }, options?: { ignoreSearch?: boolean }) {
    const wanted = new URL(hrefOf(request));
    for (const [href, response] of this.store) {
      const stored = new URL(href);
      const sameSearch = options?.ignoreSearch === true || stored.search === wanted.search;
      if (stored.pathname === wanted.pathname && sameSearch) return response.clone();
    }
    return undefined;
  }
}

class FakeCaches {
  readonly all = new Map<string, FakeCache>();

  constructor(private readonly network: (url: string) => Promise<Response>) {}

  async open(name: string) {
    if (!this.all.has(name)) this.all.set(name, new FakeCache(this.network));
    return this.all.get(name)!;
  }

  async keys() {
    return [...this.all.keys()];
  }

  async delete(name: string) {
    return this.all.delete(name);
  }

  async match(request: string | { url: string }, options?: { ignoreSearch?: boolean }) {
    for (const cache of this.all.values()) {
      const found = await cache.match(request, options);
      if (found) return found;
    }
    return undefined;
  }
}

function hrefOf(request: string | { url: string }): string {
  return new URL(typeof request === "string" ? request : request.url, ORIGIN).href;
}

interface FakeRequest {
  url: string;
  method: string;
  mode: string;
}

function request(path: string, init: Partial<FakeRequest> = {}): FakeRequest {
  return { url: `${ORIGIN}${path}`, method: "GET", mode: "cors", ...init };
}

const page = (path: string) => request(path, { mode: "navigate" });

function setup(online: Record<string, Response | number> = {}) {
  let isOnline = true;
  const routes = new Map(Object.entries(online));
  const fetchFn = vi.fn(async (input: string | { url: string }) => {
    const { pathname } = new URL(hrefOf(input));
    const route = routes.get(pathname);
    if (!isOnline || route === undefined) throw new TypeError("Failed to fetch");
    return typeof route === "number" ? new Response("x", { status: route }) : route.clone();
  });
  const caches = new FakeCaches(fetchFn);
  const listeners: Record<string, Listener> = {};
  const claim = vi.fn(async () => undefined);
  const scope = {
    addEventListener: (type: string, listener: Listener) => {
      listeners[type] = listener;
    },
    location: { origin: ORIGIN },
    clients: { claim },
  };
  const template = readFileSync(join(__dirname, "sw.template.js"), "utf8");
  const code = buildServiceWorker(template, PRECACHE, "v1");
  new Function("self", "caches", "fetch", code)(scope, caches, fetchFn);

  async function run(type: "install" | "activate") {
    let work: Promise<unknown> = Promise.resolve();
    listeners[type]({ waitUntil: (promise: Promise<unknown>) => (work = promise) });
    await work;
  }

  /** Devuelve la respuesta del worker, o null si no intercepta la petición. */
  function fetchEvent(req: FakeRequest): Promise<Response> | null {
    let response: Promise<Response> | null = null;
    listeners.fetch({
      request: req,
      respondWith: (promise: Promise<Response>) => (response = promise),
    });
    return response;
  }

  return {
    caches,
    fetchFn,
    claim,
    run,
    fetchEvent,
    goOffline: () => {
      isOnline = false;
    },
  };
}

const html = (body: string) => new Response(body, { status: 200 });
const textOf = async (response: Promise<Response> | null) => (await response)?.text();

describe("service worker: instalación y activación", () => {
  it("al instalarse precarga todas las URLs en una caché con la versión", async () => {
    const { caches, run } = setup({
      "/": html("home"),
      "/partido/": html("partido"),
      "/_next/static/chunks/app.js": html("js"),
    });

    await run("install");

    const cache = caches.all.get("futsal-stats-v1");
    expect([...(cache?.store.keys() ?? [])].map((href) => new URL(href).pathname).sort()).toEqual(
      [...PRECACHE].sort(),
    );
  });

  it("no se activa a la fuerza: no hay skipWaiting, para no cambiar de versión en pleno partido", () => {
    const code = readFileSync(join(__dirname, "sw.template.js"), "utf8");

    expect(code).not.toContain("skipWaiting");
  });

  it("al activarse borra las cachés antiguas de la app, respeta las ajenas y toma el control", async () => {
    const { caches, run, claim } = setup();
    await caches.open("futsal-stats-viejo");
    await caches.open("futsal-stats-v1");
    await caches.open("otra-app");

    await run("activate");

    expect([...caches.all.keys()].sort()).toEqual(["futsal-stats-v1", "otra-app"]);
    expect(claim).toHaveBeenCalled();
  });
});

describe("service worker: qué intercepta", () => {
  it.each([
    ["un POST", request("/x", { method: "POST" })],
    ["una petición a otro origen", { ...request("/x"), url: "https://otro.test/x" }],
    ["la API", request("/api/matches")],
    ["la raíz de la API", request("/api/")],
  ])("no intercepta %s", (_label, req) => {
    const { fetchEvent } = setup();

    expect(fetchEvent(req)).toBeNull();
  });
});

describe("service worker: ficheros con hash (_next/static)", () => {
  const ASSET = "/_next/static/chunks/app.js";

  it("sirve de la caché sin pedirlo a la red", async () => {
    const { run, fetchEvent, fetchFn } = setup({
      "/": html("home"),
      "/partido/": html("partido"),
      [ASSET]: html("js"),
    });
    await run("install");
    fetchFn.mockClear();

    expect(await textOf(fetchEvent(request(ASSET)))).toBe("js");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("si no está, lo pide a la red y lo guarda para la próxima", async () => {
    const other = "/_next/static/chunks/lazy.js";
    const { caches, run, fetchEvent, goOffline } = setup({ [other]: html("lazy") });
    await run("install").catch(() => undefined);
    await caches.open("futsal-stats-v1");

    expect(await textOf(fetchEvent(request(other)))).toBe("lazy");
    goOffline();
    expect(await textOf(fetchEvent(request(other)))).toBe("lazy");
  });
});

describe("service worker: páginas y demás ficheros", () => {
  const ROUTES = {
    "/": html("home"),
    "/partido/": html("partido"),
    "/_next/static/chunks/app.js": html("js"),
  };

  it("con red devuelve la página nueva y la guarda sin la consulta", async () => {
    const { caches, run, fetchEvent } = setup({ ...ROUTES, "/plantilla/": html("plantilla") });
    await run("install");

    expect(await textOf(fetchEvent(page("/plantilla/?x=1")))).toBe("plantilla");

    const stored = [...(caches.all.get("futsal-stats-v1")?.store.keys() ?? [])];
    expect(stored).toContain(`${ORIGIN}/plantilla/`);
    expect(stored).not.toContain(`${ORIGIN}/plantilla/?x=1`);
  });

  it("sin red sirve la página precargada aunque la dirección lleve consulta", async () => {
    const { run, fetchEvent, goOffline } = setup(ROUTES);
    await run("install");
    goOffline();

    expect(await textOf(fetchEvent(page("/partido/?id=m1")))).toBe("partido");
  });

  it("sin red y sin la barra final encuentra igualmente la página", async () => {
    const { run, fetchEvent, goOffline } = setup(ROUTES);
    await run("install");
    goOffline();

    expect(await textOf(fetchEvent(page("/partido")))).toBe("partido");
  });

  it("sin red y con una ruta desconocida cae en la portada", async () => {
    const { run, fetchEvent, goOffline } = setup(ROUTES);
    await run("install");
    goOffline();

    expect(await textOf(fetchEvent(page("/no-existe/")))).toBe("home");
  });

  it("una respuesta de error del servidor se devuelve tal cual y no se guarda", async () => {
    const { caches, run, fetchEvent } = setup({ ...ROUTES, "/roto/": 500 });
    await run("install");

    const response = await fetchEvent(page("/roto/"));

    expect(response?.status).toBe(500);
    expect([...(caches.all.get("futsal-stats-v1")?.store.keys() ?? [])]).not.toContain(`${ORIGIN}/roto/`);
  });

  it("otros ficheros del mismo origen usan la red y, sin ella, la caché ignorando la consulta", async () => {
    const { run, fetchEvent, goOffline } = setup({ ...ROUTES, "/manifest.webmanifest": html("m") });
    await run("install");
    await fetchEvent(request("/manifest.webmanifest?v=1"));
    goOffline();

    expect(await textOf(fetchEvent(request("/manifest.webmanifest?v=2")))).toBe("m");
  });

  it("sin red y sin nada guardado, un fichero que no es página falla como falla la red", async () => {
    const { run, fetchEvent, goOffline } = setup(ROUTES);
    await run("install");
    goOffline();

    await expect(fetchEvent(request("/desconocido.json"))).rejects.toThrow();
  });
});
