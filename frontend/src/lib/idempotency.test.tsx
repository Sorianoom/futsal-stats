import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useIdempotencyKey } from "./idempotency";

describe("useIdempotencyKey", () => {
  it("devuelve la misma clave mientras el contenido no cambie, para reintentar sin duplicar", () => {
    const { result } = renderHook(() => useIdempotencyKey());

    const first = result.current("jugador-1|falta-a");
    const retry = result.current("jugador-1|falta-a");

    expect(retry).toBe(first);
  });

  it("genera una clave nueva si cambia el contenido, porque ya es otra petición", () => {
    const { result } = renderHook(() => useIdempotencyKey());

    const first = result.current("jugador-1|falta-a");
    const changed = result.current("jugador-2|falta-a");

    expect(changed).not.toBe(first);
  });

  it("es un UUID y se mantiene entre renders", () => {
    const { result, rerender } = renderHook(() => useIdempotencyKey());
    const first = result.current("x");

    rerender();

    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(result.current("x")).toBe(first);
  });
});
