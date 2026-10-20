import { afterEach, describe, expect, it, vi } from "vitest";

import { newId } from "./ids";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe("newId", () => {
  it("genera un UUID v4", () => {
    expect(newId()).toMatch(UUID_V4);
  });

  it("sigue funcionando sin crypto.randomUUID (contexto no seguro, p. ej. HTTP en la red local)", () => {
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });

    expect(newId()).toMatch(UUID_V4);
  });

  it("no repite ids", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId()));
    expect(ids.size).toBe(200);
  });
});
