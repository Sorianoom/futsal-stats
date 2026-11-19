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

describe("queryCache.invalidatePrefix", () => {
  it("olvida las claves que empiezan por el prefijo y deja las demás", () => {
    queryCache.set("x:1", "uno");
    queryCache.set("x:2", "dos");
    queryCache.set("y:1", "otra");

    queryCache.invalidatePrefix("x:");

    expect(queryCache.get("x:1")).toBeUndefined();
    expect(queryCache.get("x:2")).toBeUndefined();
    expect(queryCache.get("y:1")).toBe("otra");
  });

  it("impide guardar las respuestas en curso del prefijo, aunque la clave aún no estuviera", () => {
    const startedAt = queryCache.generation();

    queryCache.invalidatePrefix("x:");
    queryCache.setIfCurrent("x:nueva", "de antes del cambio", startedAt);

    expect(queryCache.get("x:nueva")).toBeUndefined();
  });

  it("no impide guardar la respuesta en curso de una clave sin ese prefijo", () => {
    const startedAt = queryCache.generation();

    queryCache.invalidatePrefix("x:");
    queryCache.setIfCurrent("y:1", "de y", startedAt);

    expect(queryCache.get("y:1")).toBe("de y");
  });

  it("una petición que empieza tras invalidar el prefijo sí guarda", () => {
    queryCache.invalidatePrefix("x:");
    const startedAt = queryCache.generation();

    queryCache.setIfCurrent("x:1", "nuevo", startedAt);

    expect(queryCache.get("x:1")).toBe("nuevo");
  });

  it("tras vaciar, una invalidación de prefijo antigua no bloquea peticiones nuevas", () => {
    queryCache.invalidatePrefix("x:");
    queryCache.clear();
    const startedAt = queryCache.generation();

    queryCache.setIfCurrent("x:1", "nuevo", startedAt);

    expect(queryCache.get("x:1")).toBe("nuevo");
  });
});
