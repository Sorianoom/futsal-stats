import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InstallPrompt, isIos } from "./install-prompt";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36";

function setUserAgent(value: string) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(value);
}

beforeEach(() => {
  window.localStorage.clear();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isIos", () => {
  it("reconoce el iPhone y el iPad que se presenta como Mac táctil", () => {
    expect(isIos(IPHONE, 5)).toBe(true);
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 5)).toBe(true);
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 0)).toBe(false);
    expect(isIos(ANDROID, 5)).toBe(false);
  });
});

describe("InstallPrompt", () => {
  it("en el iPhone explica cómo añadirla a la pantalla de inicio", () => {
    setUserAgent(IPHONE);

    render(<InstallPrompt />);

    const aside = screen.getByRole("complementary", { name: "Instalar la app" });
    expect(aside).toHaveTextContent("Añadir a pantalla de inicio");
    expect(screen.queryByRole("button", { name: "Instalar" })).not.toBeInTheDocument();
  });

  it("en Chrome ofrece el botón Instalar cuando el navegador lo permite", async () => {
    setUserAgent(ANDROID);
    const prompt = vi.fn().mockResolvedValue(undefined);
    render(<InstallPrompt />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();

    const event = Object.assign(new Event("beforeinstallprompt"), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    });
    act(() => {
      window.dispatchEvent(event);
    });
    await userEvent.click(screen.getByRole("button", { name: "Instalar" }));

    expect(prompt).toHaveBeenCalled();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("si ya está instalada no dice nada", () => {
    setUserAgent(IPHONE);
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;

    render(<InstallPrompt />);

    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("«Ahora no» la oculta y no vuelve a salir en un tiempo", async () => {
    setUserAgent(IPHONE);
    const { unmount } = render(<InstallPrompt />);

    await userEvent.click(screen.getByRole("button", { name: "Ahora no" }));
    unmount();
    render(<InstallPrompt />);

    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
});
