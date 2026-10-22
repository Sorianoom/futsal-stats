import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

interface VercelJson {
  services: Record<string, { root: string; headers?: HeaderRule[] }>;
}

const vercel: VercelJson = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "vercel.json"), "utf8"));
const frontend = Object.values(vercel.services).find((service) => service.root.startsWith("frontend"));

/** Las cabeceras que se envían en todas las rutas del frontend. */
const headers = new Map(
  (frontend?.headers ?? [])
    .filter((rule) => rule.source === "/(.*)")
    .flatMap((rule) => rule.headers)
    .map(({ key, value }) => [key.toLowerCase(), value]),
);

/** La CSP como un mapa directiva -> fuentes. */
function directives(): Map<string, string[]> {
  const policy = headers.get("content-security-policy") ?? "";
  return new Map(
    policy
      .split(";")
      .map((part) => part.trim().split(/\s+/))
      .filter(([name]) => name !== "")
      .map(([name, ...sources]) => [name, sources]),
  );
}

describe("cabeceras de seguridad del frontend (vercel.json)", () => {
  it("se declaran para todas las rutas del servicio frontend", () => {
    expect(headers.size).toBeGreaterThan(0);
  });

  it("evitan que el navegador adivine el tipo de los ficheros", () => {
    expect(headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("impiden que otra web meta la app en un iframe", () => {
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(directives().get("frame-ancestors")).toEqual(["'none'"]);
  });

  it("no filtran la dirección completa a otros sitios", () => {
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("deniegan a la página sensores que no usa", () => {
    const policy = headers.get("permissions-policy") ?? "";

    for (const feature of ["camera", "microphone", "geolocation", "payment"]) {
      expect(policy).toContain(`${feature}=()`);
    }
  });
});

describe("política de seguridad de contenido (CSP)", () => {
  it("parte de 'self' y cierra lo que no se usa", () => {
    const csp = directives();

    expect(csp.get("default-src")).toEqual(["'self'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'self'"]);
    expect(csp.get("form-action")).toEqual(["'self'"]);
  });

  it("solo permite hablar con el propio origen (la API va en /api del mismo dominio)", () => {
    expect(directives().get("connect-src")).toEqual(["'self'"]);
  });

  it("permite el service worker y el manifiesto propios", () => {
    expect(directives().get("worker-src")).toEqual(["'self'"]);
    expect(directives().get("manifest-src")).toEqual(["'self'"]);
  });

  it("no admite scripts de fuera ni eval", () => {
    const scripts = directives().get("script-src") ?? [];

    expect(scripts).toContain("'self'");
    expect(scripts).not.toContain("'unsafe-eval'");
    expect(scripts.filter((source) => source === "*" || source.startsWith("http"))).toEqual([]);
  });

  it("ninguna directiva admite comodines ni orígenes http: sin cifrar", () => {
    for (const [name, sources] of directives()) {
      expect(sources, name).not.toContain("*");
      expect(sources.filter((source) => source.startsWith("http:")), name).toEqual([]);
    }
  });
});
