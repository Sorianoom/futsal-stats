import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface PackageJson {
  scripts: Record<string, string>;
  engines?: { node?: string };
}

const pkg: PackageJson = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf8"));

/** Primera versión de Node que acepta --experimental-strip-types. */
const MIN_NODE = [22, 6];

function minimumOf(range: string): number[] | null {
  const match = /^>=\s*(\d+)(?:\.(\d+))?/.exec(range);
  return match ? [Number(match[1]), Number(match[2] ?? 0)] : null;
}

interface VercelJson {
  services: Record<string, { root: string; buildCommand?: string }>;
}

const vercel: VercelJson = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "vercel.json"), "utf8"));

describe("despliegue en Vercel", () => {
  it("el servicio del frontend construye con `yarn build`: así se ejecuta el script que genera sw.js", () => {
    const frontend = Object.values(vercel.services).find((service) => service.root.startsWith("frontend"));

    expect(frontend?.buildCommand).toBe("yarn build");
  });
});

describe("copia de sw.js en public/", () => {
  it("public/sw.js es un fichero generado: no se versiona", () => {
    const ignored = readFileSync(join(__dirname, "..", "..", ".gitignore"), "utf8").split("\n");

    expect(ignored).toContain("/public/sw.js");
  });

  it("el script de build pide la copia en public/", () => {
    const script = readFileSync(join(__dirname, "..", "..", "scripts", "generate-sw.mts"), "utf8");

    expect(script).toMatch(/generateServiceWorker\([^)]*"public"/);
  });
});

describe("build del service worker", () => {
  it("genera sw.js justo después de next build", () => {
    expect(pkg.scripts.build).toMatch(/^next build && node .*scripts\/generate-sw\.mts$/);
  });

  it("ejecuta el script TypeScript con --experimental-strip-types", () => {
    expect(pkg.scripts.build).toContain("--experimental-strip-types");
  });

  it("declara una versión de Node que lo soporta: sin esto, un cambio de versión rompería el build en Vercel", () => {
    const minimum = minimumOf(pkg.engines?.node ?? "");

    expect(minimum).not.toBeNull();
    const [major, minor] = minimum as number[];
    expect(major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1])).toBe(true);
  });
});
