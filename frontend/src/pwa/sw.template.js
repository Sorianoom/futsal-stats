/*
 * Service worker de Futsal Stats. No se sirve tal cual: scripts/generate-sw.mts rellena la versión
 * y la lista de ficheros tras `next build` y lo escribe como out/sw.js.
 *
 * Qué hace:
 * - Al instalarse guarda todo el sitio exportado, para abrir la app sin red.
 * - Ficheros con hash (/_next/static): primero la caché, son inmutables.
 * - Páginas y demás ficheros: primero la red; sin red, lo último guardado.
 * - La API nunca pasa por aquí: los datos son siempre los del servidor o los de IndexedDB.
 * - Una versión nueva espera a que se cierren las pestañas antes de activarse: cambiar de
 *   versión en pleno partido dejaría a medias la página abierta.
 */
const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;

const CACHE_PREFIX = "futsal-stats-";
const CACHE = CACHE_PREFIX + VERSION;
const API_PATH = "/api";
const STATIC_PREFIX = "/_next/static/";
const HOME = "/";

async function remember(key, response) {
  // La caché es un respaldo: si no cabe, la respuesta se entrega igualmente.
  try {
    const cache = await caches.open(CACHE);
    await cache.put(key, response);
  } catch {
    // Sin espacio o sin permiso.
  }
}

async function fromCache(request, url) {
  if (request.mode !== "navigate") return caches.match(request, { ignoreSearch: true });
  const exact = await caches.match(url.pathname);
  if (exact) return exact;
  if (!url.pathname.endsWith("/")) {
    const withSlash = await caches.match(url.pathname + "/");
    if (withSlash) return withSlash;
  }
  return caches.match(HOME);
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await remember(request, response.clone());
  return response;
}

async function networkFirst(request, url) {
  let response;
  try {
    response = await fetch(request);
  } catch (failure) {
    const cached = await fromCache(request, url);
    if (cached) return cached;
    throw failure;
  }
  // Las páginas se guardan sin la consulta (?id=…): es la misma página para cualquier partido.
  if (response.ok) await remember(request.mode === "navigate" ? url.pathname : request, response.clone());
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  const removeOldVersions = async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE).map((name) => caches.delete(name)),
    );
  };
  event.waitUntil(removeOldVersions().then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === API_PATH || url.pathname.startsWith(API_PATH + "/")) return;
  event.respondWith(url.pathname.startsWith(STATIC_PREFIX) ? cacheFirst(request) : networkFirst(request, url));
});
