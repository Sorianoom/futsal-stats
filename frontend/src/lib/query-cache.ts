/**
 * Últimas respuestas de lectura, por clave. Solo vive en memoria y se vacía al perder la sesión
 * (ver `setAccessToken(null)`): al volver a una pestaña se enseña lo último visto mientras se
 * refresca, y nunca se enseña a otro usuario lo que vio el anterior.
 */
const entries = new Map<string, unknown>();
/**
 * Reloj que avanza en cada vaciado o invalidación. Una petición lo lee al empezar y, al llegar la
 * respuesta, solo la guarda si desde entonces no se ha vaciado la caché ni invalidado SU clave.
 */
let generation = 0;
/** Momento del último vaciado: deja viejas las respuestas en curso de cualquier clave. */
let clearedAt = 0;
/** Momento de la última invalidación de cada clave: solo deja viejas las de esa clave. */
const invalidatedAt = new Map<string, number>();
/**
 * Momento de la última invalidación de cada prefijo: deja viejas las de las claves que empiezan
 * por él, también las que aún no estaban en la caché (su primera lectura puede estar en curso).
 */
const prefixInvalidatedAt = new Map<string, number>();

function lastInvalidation(key: string): number {
  let last = invalidatedAt.get(key) ?? 0;
  for (const [prefix, at] of prefixInvalidatedAt) {
    if (key.startsWith(prefix)) last = Math.max(last, at);
  }
  return last;
}

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
  /**
   * Guarda solo si, desde que `startedAt` se leyó de `generation()`, no se ha vaciado la caché ni
   * invalidado esta clave (sola o por prefijo). Invalidar otras claves no cuenta.
   */
  setIfCurrent(key: string, value: unknown, startedAt: number): void {
    const staleBefore = Math.max(clearedAt, lastInvalidation(key));
    if (startedAt >= staleBefore) entries.set(key, value);
  },
  /** Olvida una clave tras un cambio que la deja vieja: la próxima lectura espera a la red. */
  invalidate(key: string): void {
    generation += 1;
    invalidatedAt.set(key, generation);
    entries.delete(key);
  },
  /** Como `invalidate`, para todas las claves que empiezan por `prefix` (estén o no guardadas). */
  invalidatePrefix(prefix: string): void {
    generation += 1;
    prefixInvalidatedAt.set(prefix, generation);
    for (const key of [...entries.keys()]) {
      if (key.startsWith(prefix)) entries.delete(key);
    }
  },
  clear(): void {
    generation += 1;
    clearedAt = generation;
    invalidatedAt.clear(); // el vaciado ya cubre lo que se invalidó antes
    prefixInvalidatedAt.clear();
    entries.clear();
  },
};
