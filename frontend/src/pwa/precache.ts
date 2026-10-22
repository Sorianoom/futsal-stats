import { createHash } from "node:crypto";

/**
 * Ficheros de `out/` que no sirven de nada en la caché del navegador. Las páginas 404 se excluyen
 * porque Vercel las sirve con status 404 y `cache.addAll` rechaza el lote entero si una respuesta
 * no es 2xx: el worker no llegaba a instalarse.
 */
const EXCLUDED = [/^sw\.js$/, /\.map$/, /(^|\/)\.DS_Store$/, /^404\.html$/, /^404\/index\.html$/];

const VERSION_LENGTH = 12;
const VERSION_PLACEHOLDER = "__VERSION__";
const PRECACHE_PLACEHOLDER = "__PRECACHE__";

export interface BuiltFile {
  /** Ruta relativa a `out/`. */
  path: string;
  /** Huella del contenido. */
  digest: string;
}

function toPosix(path: string): string {
  return path.replaceAll("\\", "/");
}

/** `partido/index.html` se sirve como `/partido/` (el sitio exporta con barra final). */
function urlOf(path: string): string {
  if (path === "index.html") return "/";
  if (path.endsWith("/index.html")) return `/${path.slice(0, -"index.html".length)}`;
  return `/${path}`;
}

export function isPrecachable(path: string): boolean {
  const normalized = toPosix(path);
  return !EXCLUDED.some((pattern) => pattern.test(normalized));
}

/** Las URLs que el service worker guarda al instalarse, en orden estable. */
export function precacheUrlsFor(files: readonly string[]): string[] {
  return files.filter(isPrecachable).map(toPosix).map(urlOf).sort();
}

/** Nombre corto de la caché: cambia si cambia cualquier fichero y no depende del orden. */
export function cacheVersionOf(files: readonly BuiltFile[]): string {
  const hash = createHash("sha256");
  [...files]
    .map((file) => `${toPosix(file.path)}:${file.digest}`)
    .sort()
    .forEach((line) => hash.update(`${line}\n`));
  return hash.digest("hex").slice(0, VERSION_LENGTH);
}

/** Rellena la plantilla del service worker. Falla si faltan los huecos: un worker roto no se publica. */
export function buildServiceWorker(template: string, urls: readonly string[], version: string): string {
  if (!template.includes(VERSION_PLACEHOLDER) || !template.includes(PRECACHE_PLACEHOLDER)) {
    throw new Error(
      `La plantilla del service worker debe contener ${VERSION_PLACEHOLDER} y ${PRECACHE_PLACEHOLDER}`,
    );
  }
  // Con función para que un "$" dentro de una URL no se interprete como patrón de reemplazo.
  return template
    .replace(VERSION_PLACEHOLDER, () => version)
    .replace(PRECACHE_PLACEHOLDER, () => JSON.stringify(urls));
}
