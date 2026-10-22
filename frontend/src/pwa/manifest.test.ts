import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PUBLIC_DIR = join(__dirname, "..", "..", "public");

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
}

interface Manifest {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  orientation: string;
  lang: string;
  background_color: string;
  theme_color: string;
  icons: ManifestIcon[];
}

const manifest: Manifest = JSON.parse(readFileSync(join(PUBLIC_DIR, "manifest.webmanifest"), "utf8"));

/** Ancho y alto leídos de la cabecera IHDR de un PNG. */
function pngSize(path: string): string {
  const header = readFileSync(path);
  return `${header.readUInt32BE(16)}x${header.readUInt32BE(20)}`;
}

describe("manifest.webmanifest", () => {
  it("abre la app a pantalla completa y en horizontal, como se usa en el iPad", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.orientation).toBe("landscape");
  });

  it("arranca y se limita a la raíz del sitio", () => {
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
  });

  it("tiene nombre, nombre corto, idioma y colores", () => {
    expect(manifest.name).toBe("Futsal Stats");
    expect(manifest.short_name.length).toBeGreaterThan(0);
    expect(manifest.lang).toBe("es");
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("declara iconos de 192 y 512 píxeles", () => {
    expect(manifest.icons.map((icon) => icon.sizes).sort()).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  });

  it.each(manifest.icons.map((icon) => [icon.src, icon] as const))(
    "el icono %s existe y mide lo que dice el manifiesto",
    (_src, icon) => {
      expect(icon.type).toBe("image/png");
      expect(pngSize(join(PUBLIC_DIR, icon.src))).toBe(icon.sizes);
    },
  );

  it("el icono de pantalla de inicio de iOS existe y mide 180 píxeles", () => {
    expect(pngSize(join(PUBLIC_DIR, "icons", "apple-touch-icon.png"))).toBe("180x180");
  });
});
