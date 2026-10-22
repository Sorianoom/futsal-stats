import { describe, expect, it, vi } from "vitest";

import { registerServiceWorker, requestPersistentStorage } from "./register";

type Nav = Pick<Navigator, "serviceWorker" | "storage">;

function nav(parts: Partial<Nav>): Navigator {
  return parts as Navigator;
}

describe("registerServiceWorker", () => {
  it("registra /sw.js y devuelve true", async () => {
    const register = vi.fn().mockResolvedValue({});

    const result = await registerServiceWorker(nav({ serviceWorker: { register } as never }));

    expect(register).toHaveBeenCalledWith("/sw.js");
    expect(result).toBe(true);
  });

  it("devuelve false sin hacer nada si el navegador no tiene service workers", async () => {
    await expect(registerServiceWorker(nav({}))).resolves.toBe(false);
  });

  it("devuelve false si el registro falla: la app funciona igual sin worker", async () => {
    const register = vi.fn().mockRejectedValue(new Error("SecurityError"));

    await expect(registerServiceWorker(nav({ serviceWorker: { register } as never }))).resolves.toBe(false);
  });
});

describe("requestPersistentStorage", () => {
  it("pide el almacenamiento persistente y devuelve lo que conteste el navegador", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const persisted = vi.fn().mockResolvedValue(false);

    const result = await requestPersistentStorage(nav({ storage: { persist, persisted } as never }));

    expect(persist).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("si ya es persistente no vuelve a pedirlo", async () => {
    const persist = vi.fn();
    const persisted = vi.fn().mockResolvedValue(true);

    const result = await requestPersistentStorage(nav({ storage: { persist, persisted } as never }));

    expect(persist).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("devuelve false si el navegador lo deniega", async () => {
    const storage = { persist: vi.fn().mockResolvedValue(false), persisted: vi.fn().mockResolvedValue(false) };

    await expect(requestPersistentStorage(nav({ storage: storage as never }))).resolves.toBe(false);
  });

  it("devuelve false si el navegador no lo soporta", async () => {
    await expect(requestPersistentStorage(nav({}))).resolves.toBe(false);
    await expect(requestPersistentStorage(nav({ storage: {} as never }))).resolves.toBe(false);
  });

  it("devuelve false si la petición falla", async () => {
    const storage = { persist: vi.fn().mockRejectedValue(new Error("x")), persisted: vi.fn().mockResolvedValue(false) };

    await expect(requestPersistentStorage(nav({ storage: storage as never }))).resolves.toBe(false);
  });
});
