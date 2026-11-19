import { API_URL, apiData } from "./client";
import type { Invitation, NewPlayer, Player, PlayerChanges } from "./types";

export function listPlayers(includeInactive = false): Promise<Player[]> {
  const query = includeInactive ? "?include_inactive=true" : "";
  return apiData<Player[]>(`/players${query}`);
}

export function createPlayer(player: NewPlayer): Promise<Player> {
  return apiData<Player>("/players", { method: "POST", body: player });
}

export function updatePlayer(id: string, changes: PlayerChanges): Promise<Player> {
  return apiData<Player>(`/players/${id}`, { method: "PATCH", body: changes });
}

export function deactivatePlayer(id: string): Promise<Player> {
  return apiData<Player>(`/players/${id}`, { method: "DELETE" });
}

/** Solo el entrenador principal. Responde 409 `already_has_account` si el jugador ya tiene cuenta. */
export function createInvitation(playerId: string): Promise<Invitation> {
  return apiData<Invitation>(`/players/${playerId}/invitation`, { method: "POST" });
}

/** Solo el entrenador principal. La foto ya va recortada y reducida (`squarePhoto`). */
export function uploadPlayerPhoto(playerId: string, photo: Blob): Promise<Player> {
  return apiData<Player>(`/players/${playerId}/photo`, { method: "PUT", body: photo });
}

export function deletePlayerPhoto(playerId: string): Promise<Player> {
  return apiData<Player>(`/players/${playerId}/photo`, { method: "DELETE" });
}

/** URL de una foto para una `<img>`: la API la da relativa a su raíz. */
export function photoSrc(photoUrl: string): string {
  return `${API_URL}${photoUrl}`;
}
