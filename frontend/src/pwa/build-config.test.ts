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
