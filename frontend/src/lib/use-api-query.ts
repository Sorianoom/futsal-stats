"use client";

import { useEffect, useRef, useState } from "react";

import { queryCache } from "@/lib/query-cache";

interface Loaded<T> {
  key: string;
  data: T;
}

export interface ApiQuery<T> {
  /** Lo último recibido para esta clave (o lo cacheado de una visita anterior); null si nada. */
  data: T | null;
  /** La última petición falló. Los datos anteriores, si los hay, se conservan. */
  failed: boolean;
  reload: () => void;
}

/**
 * Lee con `fetcher` cada vez que cambia `key` o se llama a `reload`. Si la clave ya se pidió antes
 * devuelve al instante lo guardado y refresca por detrás. Con `key` null no pide nada.
 */
export function useApiQuery<T>(key: string | null, fetcher: () => Promise<T>): ApiQuery<T> {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  // Qué petición falló (clave y recarga): al cambiar de clave o recargar, el aviso desaparece solo.
  const [failure, setFailure] = useState<{ key: string; reloadCount: number } | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const latestFetcher = useRef(fetcher);

  useEffect(() => {
    latestFetcher.current = fetcher;
  });

  useEffect(() => {
    if (key === null) return;
    let active = true;
    latestFetcher.current()
      .then((data) => {
        if (!active) return;
        queryCache.set(key, data);
        setLoaded({ key, data });
        setFailure(null);
      })
      .catch(() => {
        if (active) setFailure({ key, reloadCount });
      });
    return () => {
      active = false;
    };
  }, [key, reloadCount]);

  let data: T | null = null;
  if (key !== null) {
    data = loaded?.key === key ? loaded.data : ((queryCache.get(key) as T | undefined) ?? null);
  }
  const failed = failure?.key === key && failure.reloadCount === reloadCount;
  return { data, failed, reload: () => setReloadCount((count) => count + 1) };
}
