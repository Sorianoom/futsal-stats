import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FANTASY_THEME_KEY, useFantasyTheme } from "./theme";

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.className = "";
});

describe("modo del Fantasy", () => {
  it("mientras se ve, la página usa los colores del club; al salir, se quitan", () => {
    const { unmount } = renderHook(() => useFantasyTheme());

    expect(document.documentElement).toHaveClass("fantasy");
    unmount();
    expect(document.documentElement).not.toHaveClass("fantasy");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("cambia entre claro y oscuro y lo recuerda", () => {
    const { result } = renderHook(() => useFantasyTheme());
    const start = result.current.mode;

    act(() => result.current.toggle());

    const next = start === "dark" ? "light" : "dark";
    expect(result.current.mode).toBe(next);
    expect(document.documentElement.classList.contains("dark")).toBe(next === "dark");
    expect(window.localStorage.getItem(FANTASY_THEME_KEY)).toBe(next);
  });

  it("empieza con el modo que se eligió la última vez", () => {
    window.localStorage.setItem(FANTASY_THEME_KEY, "dark");

    const { result } = renderHook(() => useFantasyTheme());

    expect(result.current.mode).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
  });
});
