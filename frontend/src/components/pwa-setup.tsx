"use client";

import { useEffect } from "react";

import { registerServiceWorker, requestPersistentStorage } from "@/pwa/register";

/** El service worker solo existe en el sitio construido: en desarrollo taparía los cambios. */
const IS_PRODUCTION = process.env.NODE_ENV === "production";

/** Activa lo necesario para usar la app instalada y sin red. No pinta nada. */
export function PwaSetup({ enabled = IS_PRODUCTION }: { enabled?: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    void registerServiceWorker();
    void requestPersistentStorage();
  }, [enabled]);

  return null;
}
