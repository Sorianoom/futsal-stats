import { describe, expect, it } from "vitest";

import { buildServiceWorker, cacheVersionOf, precacheUrlsFor } from "./precache";

describe("precacheUrlsFor", () => {
  it("convierte las páginas exportadas en las rutas con barra final que sirve el sitio", () => {
    const urls = precacheUrlsFor(["index.html", "partido/index.html", "login/index.html"]);

    expect(urls).toEqual(expect.arrayContaining(["/", "/partido/", "/login/"]));
    expect(urls).not.toContain("/index.html");
    expect(urls).not.toContain("/partido/index.html");
  });

  it("deja el resto de ficheros con su ruta absoluta", () => {
    const urls = precacheUrlsFor([
      "_next/static/chunks/app-1a2b.js",
      "_next/static/media/font.woff2",
      "manifest.webmanifest",
      "icons/icon-192.png",
    ]);

    expect(urls).toEqual([
      "/_next/static/chunks/app-1a2b.js",
      "/_next/static/media/font.woff2",
      "/icons/icon-192.png",
      "/manifest.webmanifest",
    ]);
  });

  it("no precarga el propio service worker, los mapas de código ni basura del sistema", () => {
    const urls = precacheUrlsFor(["sw.js", "_next/static/chunks/a.js.map", ".DS_Store", "index.html"]);

    expect(urls).toEqual(["/"]);
  });

  it("no precarga las páginas 404: Vercel las sirve con status 404 y addAll rechaza todo el lote si una falla", () => {
    const urls = precacheUrlsFor(["404.html", "404/index.html", "_not-found/index.html", "index.html"]);

    expect(urls).not.toContain("/404.html");
    expect(urls).not.toContain("/404/");
    expect(urls).toEqual(expect.arrayContaining(["/", "/_not-found/"]));
  });

  it("usa separadores de ruta normales aunque vengan de Windows", () => {
    expect(precacheUrlsFor(["partido\\index.html", "_next\\static\\a.js"])).toEqual([
      "/_next/static/a.js",
      "/partido/",
    ]);
  });

  it("devuelve el mismo orden sea cual sea el de entrada", () => {
    const a = precacheUrlsFor(["b.txt", "a.txt", "index.html"]);
    const b = precacheUrlsFor(["index.html", "a.txt", "b.txt"]);

    expect(a).toEqual(b);
  });
});

describe("cacheVersionOf", () => {
  const FILES = [
    { path: "index.html", digest: "aaa" },
    { path: "_next/static/a.js", digest: "bbb" },
  ];

  it("es estable para los mismos ficheros, en cualquier orden", () => {
    expect(cacheVersionOf(FILES)).toBe(cacheVersionOf([...FILES].reverse()));
  });

  it("cambia si cambia el contenido de un fichero", () => {
    const changed = [FILES[0], { ...FILES[1], digest: "ccc" }];

    expect(cacheVersionOf(changed)).not.toBe(cacheVersionOf(FILES));
  });

  it("cambia si se añade o se quita un fichero", () => {
    expect(cacheVersionOf(FILES.slice(0, 1))).not.toBe(cacheVersionOf(FILES));
  });

  it("es corta y segura para usar en el nombre de una caché", () => {
    expect(cacheVersionOf(FILES)).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe("buildServiceWorker", () => {
  const TEMPLATE = 'const VERSION = "__VERSION__";\nconst PRECACHE = __PRECACHE__;\n';

  it("rellena la versión y la lista de URLs", () => {
    const code = buildServiceWorker(TEMPLATE, ["/", "/partido/"], "abc123");

    expect(code).toContain('const VERSION = "abc123";');
    expect(code).toContain('const PRECACHE = ["/","/partido/"];');
  });

  it("escapa lo que no debe romper el código generado", () => {
    const code = buildServiceWorker(TEMPLATE, ['/a"b/'], "v");

    expect(code).toContain('["/a\\"b/"]');
  });

  it.each([
    ["la versión", 'const PRECACHE = __PRECACHE__;'],
    ["la lista", 'const VERSION = "__VERSION__";'],
  ])("falla si a la plantilla le falta %s: mejor no generar nada que un worker roto", (_label, broken) => {
    expect(() => buildServiceWorker(broken, ["/"], "v")).toThrow(/plantilla/i);
  });
});
