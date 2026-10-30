/**
 * Últimas respuestas de lectura, por clave. Solo vive en memoria y se vacía al perder la sesión
 * (ver `setAccessToken(null)`): al volver a una pestaña se enseña lo último visto mientras se
 * refresca, y nunca se enseña a otro usuario lo que vio el anterior.
 */
const entries = new Map<string, unknown>();
/** Sube en cada vaciado: una petición iniciada antes no debe rellenar la caché ya vaciada. */
let generation = 0;

export const queryCache = {
  get(key: string): unknown {
    return entries.get(key);
  },
  set(key: string, value: unknown): void {
    entries.set(key, value);
  },
  generation(): number {
    return generation;
  },
  /** Guarda solo si no se ha vaciado la caché desde que `startedAt` se leyó de `generation()`. */
  setIfCurrent(key: string, value: unknown, startedAt: number): void {
    if (startedAt === generation) entries.set(key, value);
  },
  clear(): void {
    generation += 1;
    entries.clear();
  },
};
