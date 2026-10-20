import { apiData } from "./client";
import type { NewPlayer, Player, PlayerChanges } from "./types";

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
