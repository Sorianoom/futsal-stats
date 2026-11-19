"use client";

import { useEffect, useState } from "react";

const MINUTE_MS = 60_000;

/** La hora actual, refrescada cada `intervalMs` (por defecto, cada minuto) para cuentas atrás. */
export function useNow(intervalMs: number = MINUTE_MS): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
