import { apiData } from "./client";
import type { Invitation } from "./types";

/** Cuenta del cuerpo técnico solo para jugar al Fantasy, con la plantilla privada. */
export interface FantasyAccount {
  id: string;
  email: string;
  display_name: string | null;
}

/** Solo el entrenador principal: las cuentas activas del Fantasy del cuerpo técnico. */
export function listFantasyAccounts(): Promise<FantasyAccount[]> {
  return apiData<FantasyAccount[]>("/fantasy-accounts");
}

/** Enlace de un solo uso para crear una cuenta del Fantasy con ese nombre. */
export function createFantasyInvitation(displayName: string): Promise<Invitation> {
  return apiData<Invitation>("/fantasy-accounts/invitation", {
    method: "POST",
    body: { display_name: displayName },
  });
}

/** Desactiva la cuenta y cierra sus sesiones; su equipo sigue en la liga. */
export function deactivateFantasyAccount(id: string): Promise<void> {
  return apiData<void>(`/fantasy-accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
}
