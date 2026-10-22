import { useEffect } from "react";

/**
 * Mantiene la pantalla encendida mientras `active`. El navegador suelta el bloqueo solo al ocultar la
 * pestaña, así que se vuelve a pedir al volver a verla. Si no hay soporte o lo deniega (p. ej. con
 * batería baja), el partido sigue igual: es una comodidad, no algo de lo que dependa el registro.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let requesting = false;
    let cancelled = false;

    async function acquire() {
      if (cancelled || requesting || sentinel !== null || document.visibilityState !== "visible") return;
      requesting = true;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await lock.release().catch(() => undefined);
          return;
        }
        sentinel = lock;
        lock.addEventListener("release", () => {
          if (sentinel === lock) sentinel = null;
        });
      } catch {
        // Denegado: se reintenta la próxima vez que se vea la pestaña.
      } finally {
        requesting = false;
      }
    }

    function acquireWhenVisible() {
      void acquire();
    }

    void acquire();
    document.addEventListener("visibilitychange", acquireWhenVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquireWhenVisible);
      void sentinel?.release().catch(() => undefined);
      sentinel = null;
    };
  }, [active]);
}
