import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildServiceWorker } from "./precache";

const ORIGIN = "https://app.test";
const PRECACHE = ["/", "/partido/", "/_next/static/chunks/app.js", "/manifest.webmanifest"];
/** Un servidor que no responde nunca: para probar el tiempo límite. */
const HANG = Symbol("hang");

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

type Route = Response | number | typeof HANG;

function setup(online: Record<string, Route> = {}) {
  let isOnline = true;
  const routes = new Map<string, Route>(Object.entries(online));
  const fetchFn = vi.fn(async (input: string | { url: string }) => {
    const { pathname } = new URL(hrefOf(input));
    const route = routes.get(pathname);
    if (!isOnline || route === undefined) throw new TypeError("Failed to fetch");
    if (route === HANG) return new Promise<Response>(() => undefined);
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
    /** Cambia lo que contesta el servidor a partir de ahora (p. ej. tras instalar). */
    setRoute: (path: string, route: Route) => {
      routes.set(path, route);
    },
  };
}

const html = (body: string) => new Response(body, { status: 200 });
const textOf = async (response: Promise<Response> | null) => (await response)?.text();
const storedPaths = (caches: FakeCaches) =>
  [...(caches.all.get("futsal-stats-v1")?.store.keys() ?? [])].map((href) => href.replace(ORIGIN, "")).sort();

/** Todo lo que el worker precarga al instalarse. */
const SITE = {
  "/": html("home"),
  "/partido/": html("partido"),
  "/_next/static/chunks/app.js": html("js"),
  "/manifest.webmanifest": html("m"),
};

describe("service worker: instalación y activación", () => {
  it("al instalarse precarga todas las URLs en una caché con la versión", async () => {
    const { caches, run } = setup(SITE);

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
    const { run, fetchEvent, fetchFn } = setup(SITE);
    await run("install");
    fetchFn.mockClear();

    expect(await textOf(fetchEvent(request(ASSET)))).toBe("js");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("si no está, lo pide a la red y lo guarda para la próxima", async () => {
    const other = "/_next/static/chunks/lazy.js";
    const { run, fetchEvent, goOffline } = setup({ ...SITE, [other]: html("lazy") });
    await run("install");

    expect(await textOf(fetchEvent(request(other)))).toBe("lazy");
    goOffline();
    expect(await textOf(fetchEvent(request(other)))).toBe("lazy");
  });

  it("lo guarda sin la consulta, para que cada valor distinto no cree una entrada nueva", async () => {
    const other = "/_next/static/chunks/lazy.js";
    const { caches, run, fetchEvent } = setup({ ...SITE, [other]: html("lazy") });
    await run("install");

    await fetchEvent(request(`${other}?_rsc=abc`));

    expect(storedPaths(caches)).toContain(other);
    expect(storedPaths(caches)).not.toContain(`${other}?_rsc=abc`);
  });
});

describe("service worker: páginas y demás ficheros", () => {
  const TIMEOUT_MS = 3500;

  afterEach(() => {
    vi.useRealTimers();
  });

  it("con red devuelve la página del servidor y no guarda nada nuevo: sirve de respaldo lo precargado", async () => {
    const { caches, run, fetchEvent } = setup({ ...SITE, "/plantilla/": html("plantilla") });
    await run("install");
    const before = storedPaths(caches);

    expect(await textOf(fetchEvent(page("/plantilla/?x=1")))).toBe("plantilla");
    expect(await textOf(fetchEvent(request("/manifest.webmanifest?v=1")))).toBe("m");

    expect(storedPaths(caches)).toEqual(before);
  });

  it("sin red sirve la página precargada aunque la dirección lleve consulta", async () => {
    const { run, fetchEvent, goOffline } = setup(SITE);
    await run("install");
    goOffline();

    expect(await textOf(fetchEvent(page("/partido/?id=m1")))).toBe("partido");
  });

  it("sin red y sin la barra final encuentra igualmente la página", async () => {
    const { run, fetchEvent, goOffline } = setup(SITE);
    await run("install");
    goOffline();

    expect(await textOf(fetchEvent(page("/partido")))).toBe("partido");
  });

  it("sin red y con una ruta desconocida cae en la portada", async () => {
    const { run, fetchEvent, goOffline } = setup(SITE);
    await run("install");
    goOffline();

    expect(await textOf(fetchEvent(page("/no-existe/")))).toBe("home");
  });

  it("un error 4xx del servidor se devuelve tal cual", async () => {
    const { run, fetchEvent } = setup({ ...SITE, "/roto/": 404 });
    await run("install");

    expect((await fetchEvent(page("/roto/")))?.status).toBe(404);
  });

  it.each([500, 502, 503, 504])("con un %i del servidor sirve la copia precargada en vez del error", async (status) => {
    const { run, fetchEvent, setRoute } = setup(SITE);
    await run("install");
    setRoute("/partido/", status);

    expect(await textOf(fetchEvent(page("/partido/?id=m1")))).toBe("partido");
  });

  it("un 5xx de algo que no se tiene precargado se devuelve tal cual si tampoco hay portada", async () => {
    const { run, fetchEvent, setRoute } = setup({ ...SITE });
    await run("install");
    setRoute("/desconocido.json", 503);

    expect((await fetchEvent(request("/desconocido.json")))?.status).toBe(503);
  });

  it("otros ficheros del mismo origen: sin red usa la copia precargada ignorando la consulta", async () => {
    const { run, fetchEvent, goOffline } = setup(SITE);
    await run("install");
    goOffline();

    expect(await textOf(fetchEvent(request("/manifest.webmanifest?v=2")))).toBe("m");
  });

  it("sin red y sin nada guardado, un fichero que no es página falla como falla la red", async () => {
    const { run, fetchEvent, goOffline } = setup(SITE);
    await run("install");
    goOffline();

    await expect(fetchEvent(request("/desconocido.json"))).rejects.toThrow();
  });

  it("si la red no contesta a tiempo (wifi sin internet), sirve la copia sin esperar", async () => {
    const { run, fetchEvent, setRoute } = setup(SITE);
    await run("install");
    setRoute("/partido/", HANG);
    vi.useFakeTimers();

    const response = fetchEvent(page("/partido/?id=m1"));
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS + 100);

    expect(await textOf(response)).toBe("partido");
  });

  it("no corta antes de tiempo: una red lenta pero que contesta gana a la copia", async () => {
    const { run, fetchEvent, setRoute } = setup(SITE);
    await run("install");
    setRoute("/partido/", html("partido nuevo"));
    vi.useFakeTimers();

    const response = fetchEvent(page("/partido/"));
    await vi.advanceTimersByTimeAsync(10);

    expect(await textOf(response)).toBe("partido nuevo");
  });

  it("si la red no contesta y tampoco hay copia, sigue esperando a la red", async () => {
    const { run, fetchEvent, setRoute } = setup(SITE);
    await run("install");
    setRoute("/desconocido.json", HANG);
    vi.useFakeTimers();

    let settled = false;
    const response = fetchEvent(request("/desconocido.json"));
    response?.then(
      () => (settled = true),
      () => (settled = true),
    );
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS * 3);

    expect(settled).toBe(false);
  });
});
