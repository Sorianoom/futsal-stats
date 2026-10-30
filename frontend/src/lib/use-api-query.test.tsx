import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setAccessToken } from "@/lib/api/client";
import { queryCache } from "@/lib/query-cache";
import { useApiQuery } from "@/lib/use-api-query";

beforeEach(() => {
  queryCache.clear();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useApiQuery", () => {
  it("empieza sin datos y los entrega al llegar", async () => {
    const { result } = renderHook(() => useApiQuery("k", () => Promise.resolve(["a"])));

    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data).toEqual(["a"]));
    expect(result.current.failed).toBe(false);
  });

  it("muestra al instante lo último que vio mientras refresca por detrás", async () => {
    queryCache.set("k", ["viejo"]);
    const pending = deferred<string[]>();

    const { result } = renderHook(() => useApiQuery("k", () => pending.promise));

    expect(result.current.data).toEqual(["viejo"]);
    await act(async () => pending.resolve(["nuevo"]));
    expect(result.current.data).toEqual(["nuevo"]);
  });

  it("guarda el resultado para la próxima vez", async () => {
    const { result } = renderHook(() => useApiQuery("k", () => Promise.resolve(1)));
    await waitFor(() => expect(result.current.data).toBe(1));

    expect(queryCache.get("k")).toBe(1);
  });

  it("si falla conserva lo que había y avisa", async () => {
    queryCache.set("k", ["viejo"]);

    const { result } = renderHook(() => useApiQuery("k", () => Promise.reject(new Error("x"))));

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.data).toEqual(["viejo"]);
  });

  it("no enseña los datos de otra clave", async () => {
    queryCache.set("a", "de-a");
    const pending = deferred<string>();

    const { result } = renderHook(() => useApiQuery("b", () => pending.promise));

    expect(result.current.data).toBeNull();
  });

  it("con clave null no pide nada", () => {
    const fetcher = vi.fn(() => Promise.resolve(1));

    const { result } = renderHook(() => useApiQuery(null, fetcher));

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
  });

  it("descarta la respuesta de una clave que ya no está visible", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const { result, rerender } = renderHook(
      ({ id }) => useApiQuery(id, () => (id === "a" ? first.promise : second.promise)),
      { initialProps: { id: "a" } },
    );
    rerender({ id: "b" });

    await act(async () => first.resolve("tarde"));
    await act(async () => second.resolve("b-ok"));

    expect(result.current.data).toBe("b-ok");
    expect(queryCache.get("a")).toBeUndefined();
  });

  it("reload vuelve a pedir y limpia el aviso de fallo", async () => {
    const fetcher = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("x"))
      .mockResolvedValueOnce(2);
    const { result } = renderHook(() => useApiQuery("k", fetcher));
    await waitFor(() => expect(result.current.failed).toBe(true));

    act(() => result.current.reload());

    await waitFor(() => expect(result.current.data).toBe(2));
    expect(result.current.failed).toBe(false);
  });

  it("el aviso de fallo no pasa a otra clave", async () => {
    const { result, rerender } = renderHook(
      ({ id }) => useApiQuery(id, () => (id === "a" ? Promise.reject(new Error("x")) : new Promise<number>(() => {}))),
      { initialProps: { id: "a" } },
    );
    await waitFor(() => expect(result.current.failed).toBe(true));

    rerender({ id: "b" });

    expect(result.current.failed).toBe(false);
  });

  it("se vacía al cerrar la sesión para no enseñar datos a otro usuario", () => {
    queryCache.set("k", "privado");

    setAccessToken(null);

    expect(queryCache.get("k")).toBeUndefined();
  });
});
