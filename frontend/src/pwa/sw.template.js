/*
 * Service worker de Futsal Stats. No se sirve tal cual: scripts/generate-sw.mts rellena la versión
 * y la lista de ficheros tras `next build` y lo escribe como out/sw.js.
 *
 * Qué hace:
 * - Al instalarse guarda todo el sitio exportado, para abrir la app sin red.
 * - Ficheros con hash (/_next/static): primero la caché, son inmutables.
 * - Páginas y demás ficheros: primero la red, pero si tarda más de unos segundos (wifi sin salida a
 *   internet) o responde con un 5xx, se sirve lo precargado. En ejecución solo se guardan ficheros con
 *   hash: las páginas no, porque ya están todas precargadas y guardar HTML nuevo junto a chunks viejos
 *   mezclaría versiones.
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
const NETWORK_TIMEOUT_MS = 3500;
const SERVER_ERROR_FROM = 500;

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

async function cacheFirst(request, url) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  // Sin la consulta: cada valor distinto de ?_rsc=… no debe crear una entrada nueva.
  if (response.ok) await remember(url.origin + url.pathname, response.clone());
  return response;
}

/** El resultado de la red, sin lanzar: así se puede esperar a la vez que corre el temporizador. */
function settle(promise) {
  return promise.then(
    (response) => ({ response }),
    (failure) => ({ failure }),
  );
}

/** Resuelve a null si `promise` no termina en `ms`. */
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function unwrap(outcome) {
  if ("failure" in outcome) throw outcome.failure;
  return outcome.response;
}

async function networkFirst(request, url) {
  const network = settle(fetch(request));
  const outcome = await withTimeout(network, NETWORK_TIMEOUT_MS);
  const answered = outcome !== null && "response" in outcome && outcome.response.status < SERVER_ERROR_FROM;
  if (answered) return outcome.response;
  // Sin red, con la red colgada o con un error del servidor: mejor la copia precargada.
  const cached = await fromCache(request, url);
  if (cached) return cached;
  // Sin copia no hay alternativa: se espera a la red y se entrega lo que conteste.
  return unwrap(outcome ?? (await network));
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
  event.respondWith(url.pathname.startsWith(STATIC_PREFIX) ? cacheFirst(request, url) : networkFirst(request, url));
});
