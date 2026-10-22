import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PwaSetup } from "./pwa-setup";

const pwa = vi.hoisted(() => ({
  registerServiceWorker: vi.fn().mockResolvedValue(true),
  requestPersistentStorage: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/pwa/register", () => pwa);

beforeEach(() => {
  pwa.registerServiceWorker.mockClear();
  pwa.requestPersistentStorage.mockClear();
});

describe("PwaSetup", () => {
  it("registra el service worker y pide almacenamiento persistente cuando está habilitado", () => {
    render(<PwaSetup enabled />);

    expect(pwa.registerServiceWorker).toHaveBeenCalledTimes(1);
    expect(pwa.requestPersistentStorage).toHaveBeenCalledTimes(1);
  });

  it("no hace nada si no está habilitado (desarrollo y tests)", () => {
    render(<PwaSetup enabled={false} />);

    expect(pwa.registerServiceWorker).not.toHaveBeenCalled();
    expect(pwa.requestPersistentStorage).not.toHaveBeenCalled();
  });

  it("por defecto solo se habilita en producción, no en los tests", () => {
    render(<PwaSetup />);

    expect(pwa.registerServiceWorker).not.toHaveBeenCalled();
  });

  it("no pinta nada", () => {
    const { container } = render(<PwaSetup enabled />);

    expect(container).toBeEmptyDOMElement();
  });
});
