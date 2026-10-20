import { useCallback, useRef } from "react";

import { newId } from "@/lib/ids";

/**
 * Clave de idempotencia por intención. `keyFor(firma)` devuelve la misma clave mientras la firma
 * (lo que se va a enviar) no cambie, así un reintento tras un corte de red no duplica el alta;
 * si cambia el contenido ya es otra petición y se genera una clave nueva.
 */
export function useIdempotencyKey(): (signature: string) => string {
  const current = useRef<{ signature: string; key: string } | null>(null);
  return useCallback((signature: string) => {
    if (current.current?.signature !== signature) current.current = { signature, key: newId() };
    return current.current.key;
  }, []);
}
