import type { Player } from "@/lib/api/types";

/** Cómo se llama al jugador donde hay poco sitio: su alias y, si no tiene, el nombre completo. */
export function shortName(player: Pick<Player, "name" | "alias">): string {
  return player.alias?.trim() || player.name;
}
