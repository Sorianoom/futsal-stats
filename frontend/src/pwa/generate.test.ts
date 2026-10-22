import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateServiceWorker } from "./generate";

const TEMPLATE = 'const VERSION = "__VERSION__";\nconst PRECACHE = __PRECACHE__;\n';

let dir: string;
let outDir: string;
let templatePath: string;

async function put(path: string, content: string) {
  const full = join(outDir, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "futsal-sw-"));
  outDir = join(dir, "out");
  templatePath = join(dir, "sw.template.js");
  await writeFile(templatePath, TEMPLATE);
  await put("index.html", "home");
  await put("partido/index.html", "partido");
  await put("_next/static/chunks/app.js", "js");
  await put("_next/static/chunks/app.js.map", "map");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("generateServiceWorker", () => {
  it("escribe out/sw.js con las URLs del sitio exportado", async () => {
    const { urls } = await generateServiceWorker(outDir, templatePath);

    expect(urls).toEqual(["/", "/_next/static/chunks/app.js", "/partido/"]);
    const code = await readFile(join(outDir, "sw.js"), "utf8");
    expect(code).toContain('["/","/_next/static/chunks/app.js","/partido/"]');
  });

  it("escribe también una copia idéntica en la carpeta indicada (public/), que Vercel sí publica", async () => {
    const mirror = join(dir, "public");

    await generateServiceWorker(outDir, templatePath, mirror);

    const original = await readFile(join(outDir, "sw.js"), "utf8");
    expect(await readFile(join(mirror, "sw.js"), "utf8")).toBe(original);
  });

  it("sin carpeta de copia no escribe nada más fuera de out/", async () => {
    await generateServiceWorker(outDir, templatePath);

    await expect(readFile(join(dir, "public", "sw.js"), "utf8")).rejects.toThrow();
  });

  it("la copia anterior en la carpeta de copia no cambia la versión al regenerar", async () => {
    const mirror = join(dir, "public");
    const first = await generateServiceWorker(outDir, templatePath, mirror);
    // next build copia public/ dentro de out/: el sw.js viejo reaparece ahí antes de regenerar.
    await put("sw.js", "viejo");

    const second = await generateServiceWorker(outDir, templatePath, mirror);

    expect(second.version).toBe(first.version);
  });

  it("la versión es la misma al regenerar: el sw.js anterior no cuenta", async () => {
    const first = await generateServiceWorker(outDir, templatePath);
    const second = await generateServiceWorker(outDir, templatePath);

    expect(second.version).toBe(first.version);
  });

  it("la versión cambia si cambia el contenido de un fichero", async () => {
    const before = await generateServiceWorker(outDir, templatePath);
    await put("_next/static/chunks/app.js", "js nuevo");

    const after = await generateServiceWorker(outDir, templatePath);

    expect(after.version).not.toBe(before.version);
  });

  it("falla con un mensaje claro si no existe la carpeta exportada", async () => {
    await expect(generateServiceWorker(join(dir, "no-existe"), templatePath)).rejects.toThrow(/out|exportad/i);
  });

  it("falla si no hay ninguna página que precargar", async () => {
    const empty = join(dir, "vacia");
    await mkdir(empty);

    await expect(generateServiceWorker(empty, templatePath)).rejects.toThrow(/vac/i);
  });
});
