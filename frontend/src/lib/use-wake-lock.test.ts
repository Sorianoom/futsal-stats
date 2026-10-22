import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWakeLock } from "./use-wake-lock";

/** Un bloqueo de pantalla de mentira: se puede soltar a mano como hace el sistema al ocultar la pestaña. */
class FakeSentinel extends EventTarget {
  released = false;

  release = vi.fn(async () => {
    this.released = true;
    this.dispatchEvent(new Event("release"));
  });
}

let sentinels: FakeSentinel[];
let request: ReturnType<typeof vi.fn>;
let visibility: "visible" | "hidden";

function setVisibility(next: "visible" | "hidden") {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  sentinels = [];
  visibility = "visible";
  request = vi.fn(async () => {
    const sentinel = new FakeSentinel();
    sentinels.push(sentinel);
    return sentinel;
  });
  Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "wakeLock");
});

async function flush() {
  await act(async () => {});
}

describe("useWakeLock", () => {
  it("pide que la pantalla no se apague mientras está activo", async () => {
    renderHook(() => useWakeLock(true));
    await flush();

    expect(request).toHaveBeenCalledWith("screen");
  });

  it("no pide nada si no está activo", async () => {
    renderHook(() => useWakeLock(false));
    await flush();

    expect(request).not.toHaveBeenCalled();
  });

  it("suelta el bloqueo al desmontar", async () => {
    const { unmount } = renderHook(() => useWakeLock(true));
    await flush();

    unmount();
    await flush();

    expect(sentinels[0].release).toHaveBeenCalled();
  });

  it("suelta el bloqueo al dejar de estar activo y lo vuelve a pedir al activarse", async () => {
    const { rerender } = renderHook(({ active }) => useWakeLock(active), { initialProps: { active: true } });
    await flush();

    rerender({ active: false });
    await flush();
    expect(sentinels[0].release).toHaveBeenCalled();

    rerender({ active: true });
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("no lo pide con la pestaña oculta y lo pide al volver a verla", async () => {
    visibility = "hidden";
    renderHook(() => useWakeLock(true));
    await flush();
    expect(request).not.toHaveBeenCalled();

    setVisibility("visible");
    await flush();

    expect(request).toHaveBeenCalledTimes(1);
  });

  it("lo recupera cuando el sistema lo suelta al ocultar la pestaña", async () => {
    renderHook(() => useWakeLock(true));
    await flush();

    await act(async () => {
      await sentinels[0].release();
    });
    setVisibility("hidden");
    setVisibility("visible");
    await flush();

    expect(request).toHaveBeenCalledTimes(2);
  });

  it("no acumula bloqueos si la pestaña se muestra varias veces seguidas", async () => {
    renderHook(() => useWakeLock(true));
    await flush();

    setVisibility("visible");
    setVisibility("visible");
    await flush();

    expect(request).toHaveBeenCalledTimes(1);
  });

  it("con dos avisos de visibilidad a la vez antes de recibir el bloqueo, solo pide uno", async () => {
    visibility = "hidden";
    renderHook(() => useWakeLock(true));
    await flush();

    setVisibility("visible");
    setVisibility("visible");
    await flush();

    expect(request).toHaveBeenCalledTimes(1);
  });

  it("si se desmonta antes de que llegue el bloqueo, lo suelta en cuanto llega", async () => {
    let deliver!: (sentinel: FakeSentinel) => void;
    request.mockImplementationOnce(
      () =>
        new Promise<FakeSentinel>((resolve) => {
          deliver = resolve;
        }),
    );
    const { unmount } = renderHook(() => useWakeLock(true));
    unmount();

    const late = new FakeSentinel();
    await act(async () => deliver(late));

    expect(late.release).toHaveBeenCalled();
  });

  it("si el navegador lo deniega no falla y lo reintenta al volver a la pestaña", async () => {
    request.mockRejectedValueOnce(new DOMException("batería baja", "NotAllowedError"));
    renderHook(() => useWakeLock(true));
    await flush();

    setVisibility("hidden");
    setVisibility("visible");
    await flush();

    expect(request).toHaveBeenCalledTimes(2);
  });

  it("no hace nada, y no falla, si el navegador no soporta wakeLock", async () => {
    Reflect.deleteProperty(navigator, "wakeLock");

    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
    await flush();
  });
});
