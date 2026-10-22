import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

// Con extensión: este módulo lo ejecuta Node directamente desde scripts/generate-sw.ts.
import { buildServiceWorker, cacheVersionOf, isPrecachable, precacheUrlsFor, type BuiltFile } from "./precache.ts";

const SW_FILE = "sw.js";

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)])),
  );
  return nested.flat();
}

async function digestOf(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

export interface GeneratedWorker {
  version: string;
  urls: string[];
}

/**
 * Lee el sitio exportado en `outDir` y escribe `sw.js` a partir de la plantilla. Con `mirrorDir`
 * escribe además una copia ahí: Vercel publica `public/` pero no lo que se añade a `out/` después
 * de `next build`, así que sin la copia `/sw.js` daba 404 en producción.
 */
export async function generateServiceWorker(
  outDir: string,
  templatePath: string,
  mirrorDir?: string,
): Promise<GeneratedWorker> {
  const found = await stat(outDir).catch(() => null);
  if (found === null || !found.isDirectory()) {
    throw new Error(`No existe la carpeta exportada ${outDir}: ejecuta antes "next build"`);
  }

  const paths = (await walk(outDir)).map((path) => relative(outDir, path)).filter(isPrecachable);
  if (paths.length === 0) throw new Error(`La carpeta ${outDir} está vacía: no hay nada que precargar`);

  const files: BuiltFile[] = await Promise.all(
    paths.map(async (path) => ({ path, digest: await digestOf(join(outDir, path)) })),
  );
  const urls = precacheUrlsFor(paths);
  const version = cacheVersionOf(files);
  const template = await readFile(templatePath, "utf8");
  const code = buildServiceWorker(template, urls, version);
  await writeFile(join(outDir, SW_FILE), code);
  if (mirrorDir !== undefined) {
    await mkdir(mirrorDir, { recursive: true });
    await writeFile(join(mirrorDir, SW_FILE), code);
  }
  return { version, urls };
}
