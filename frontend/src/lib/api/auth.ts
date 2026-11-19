import { ApiError, apiData, refreshAccessToken, setAccessToken } from "./client";
import type { InvitationAcceptance, LoginData, User } from "./types";

export async function login(email: string, password: string): Promise<User> {
  const data = await apiData<LoginData>("/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
  setAccessToken(data.access_token);
  return data.user;
}

/**
 * Cierra la sesión. Solo borra el token local cuando el servidor lo confirma: si falla, la cookie
 * de refresco sigue viva y fingir el cierre dejaría la sesión abierta en un iPad compartido.
 * Un 401 significa que ya no había sesión y cuenta como cerrada.
 */
export async function logout(): Promise<void> {
  try {
    await apiData<null>("/auth/logout", { method: "POST", auth: false });
  } catch (failure) {
    if (!(failure instanceof ApiError && failure.status === 401)) throw failure;
  }
  setAccessToken(null);
}

/** Intenta reanudar la sesión con la cookie de refresco. Devuelve null si no hay sesión. */
export async function restoreSession(): Promise<User | null> {
  if (!(await refreshAccessToken())) return null;
  return apiData<User>("/auth/me");
}

/** Crea la cuenta del jugador con su invitación. No abre sesión: después hay que hacer login. */
export function acceptInvitation(acceptance: InvitationAcceptance): Promise<User> {
  return apiData<User>("/auth/invitations/accept", {
    method: "POST",
    body: acceptance,
    auth: false,
  });
}

/** Pone o quita (null) el nombre visible. Solo el personal técnico. */
export function updateMyName(displayName: string | null): Promise<User> {
  return apiData<User>("/auth/me", { method: "PATCH", body: { display_name: displayName } });
}
