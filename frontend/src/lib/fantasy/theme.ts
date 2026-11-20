"use client";

import { useCallback, useEffect, useState } from "react";

/** Modo claro u oscuro del Fantasy, recordado en este navegador. */
export type FantasyMode = "light" | "dark";

export const FANTASY_THEME_KEY = "futsal:fantasy:theme";

function savedMode(): FantasyMode | null {
  try {
    const saved = window.localStorage.getItem(FANTASY_THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : null;
  } catch {
    return null;
  }
}

function systemMode(): FantasyMode {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Mientras el Fantasy está en pantalla, <html> lleva la clase `fantasy` (colores del club) y
 * `dark` en modo oscuro. Sin elección guardada, sigue el modo del móvil.
 */
export function useFantasyTheme(): { mode: FantasyMode; toggle: () => void } {
  const [mode, setMode] = useState<FantasyMode>(() => savedMode() ?? systemMode());

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("fantasy");
    root.classList.toggle("dark", mode === "dark");
    return () => root.classList.remove("fantasy", "dark");
  }, [mode]);

  const toggle = useCallback(() => {
    setMode((current) => {
      const next = current === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(FANTASY_THEME_KEY, next);
      } catch {
        // Sin almacenamiento: el cambio dura esta visita.
      }
      return next;
    });
  }, []);

  return { mode, toggle };
}
