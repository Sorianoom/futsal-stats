import type { Role, User } from "@/lib/api/types";

const KEY = "futsal-stats:user";
const ROLES: readonly Role[] = ["head_coach", "assistant_coach"];

function isRole(value: unknown): value is Role {
  return ROLES.some((role) => role === value);
}

/**
 * Último usuario con sesión verificada, para entrar sin red. Guarda solo id, correo y rol: nunca
 * tokens, así que sin red no da acceso a nada que el servidor no confirme después.
 */
export function saveUser(user: User): void {
  try {
    const { id, email, role } = user;
    window.localStorage.setItem(KEY, JSON.stringify({ id, email, role }));
  } catch {
    // Sin almacenamiento solo se pierde la entrada sin red; la sesión normal no depende de esto.
  }
}

export function loadSavedUser(): User | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { id, email, role } = parsed as Record<string, unknown>;
    if (typeof id !== "string" || typeof email !== "string" || !isRole(role)) return null;
    return { id, email, role };
  } catch {
    return null;
  }
}

export function clearSavedUser(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Ver saveUser.
  }
}
