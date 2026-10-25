import { describe, expect, it } from "vitest";

import { previewApiUrl } from "./preview-api-url";

describe("previewApiUrl", () => {
  it("en una vista previa de Vercel apunta al /api de ese mismo despliegue", () => {
    const url = previewApiUrl({
      VERCEL_ENV: "preview",
      VERCEL_URL: "futsal-stats-git-feat-x-tfg-sori.vercel.app",
    });

    expect(url).toBe("https://futsal-stats-git-feat-x-tfg-sori.vercel.app/api");
  });

  it("respeta la URL configurada a mano", () => {
    const url = previewApiUrl({
      NEXT_PUBLIC_API_URL: "https://api.club.es",
      VERCEL_ENV: "preview",
      VERCEL_URL: "futsal-stats-abc.vercel.app",
    });

    expect(url).toBeUndefined();
  });

  it("en producción no inventa nada: la URL tiene que estar configurada", () => {
    const url = previewApiUrl({ VERCEL_ENV: "production", VERCEL_URL: "futsal-stats.vercel.app" });

    expect(url).toBeUndefined();
  });

  it("fuera de Vercel (local o CI) no hace nada", () => {
    expect(previewApiUrl({})).toBeUndefined();
  });

  it("ignora un VERCEL_URL que no sea un nombre de host", () => {
    expect(previewApiUrl({ VERCEL_ENV: "preview", VERCEL_URL: "https://x.vercel.app" })).toBeUndefined();
    expect(previewApiUrl({ VERCEL_ENV: "preview", VERCEL_URL: "x.vercel.app/ruta" })).toBeUndefined();
    expect(previewApiUrl({ VERCEL_ENV: "preview", VERCEL_URL: " " })).toBeUndefined();
    expect(previewApiUrl({ VERCEL_ENV: "preview" })).toBeUndefined();
  });
});
