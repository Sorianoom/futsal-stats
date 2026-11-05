import { beforeEach, describe, expect, it } from "vitest";

import { queryCache } from "@/lib/query-cache";

beforeEach(() => {
  queryCache.clear();
});

describe("queryCache.setIfCurrent", () => {
  it("guarda si nada ha cambiado desde que empezó la petición", () => {
    const startedAt = queryCache.generation();

    queryCache.setIfCurrent("a", "nuevo", startedAt);

    expect(queryCache.get("a")).toBe("nuevo");
  });

  it("invalidar una clave no impide guardar la respuesta en curso de otra", () => {
    const startedAt = queryCache.generation();

    queryCache.invalidate("a");
    queryCache.setIfCurrent("b", "de-b", startedAt);

    expect(queryCache.get("b")).toBe("de-b");
  });

  it("invalidar una clave impide guardar su propia respuesta en curso", () => {
    const startedAt = queryCache.generation();

    queryCache.invalidate("a");
    queryCache.setIfCurrent("a", "de antes del cambio", startedAt);

    expect(queryCache.get("a")).toBeUndefined();
  });

  it("una petición que empieza tras invalidar sí guarda", () => {
    queryCache.invalidate("a");
    const startedAt = queryCache.generation();

    queryCache.setIfCurrent("a", "nuevo", startedAt);

    expect(queryCache.get("a")).toBe("nuevo");
  });

  it("vaciar la caché impide guardar las respuestas en curso de cualquier clave", () => {
    const startedAt = queryCache.generation();

    queryCache.clear();
    queryCache.setIfCurrent("a", "de la sesión anterior", startedAt);
    queryCache.setIfCurrent("b", "de la sesión anterior", startedAt);

    expect(queryCache.get("a")).toBeUndefined();
    expect(queryCache.get("b")).toBeUndefined();
  });

  it("tras vaciar, una invalidación antigua no bloquea peticiones nuevas", () => {
    queryCache.invalidate("a");
    queryCache.clear();
    const startedAt = queryCache.generation();

    queryCache.setIfCurrent("a", "nuevo", startedAt);

    expect(queryCache.get("a")).toBe("nuevo");
  });
});
