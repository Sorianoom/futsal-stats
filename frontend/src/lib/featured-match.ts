import type { Match } from "@/lib/api/match-types";

export interface FeaturedMatch {
  /** `upcoming`: hoy o más adelante. `last`: ya jugado, el más reciente. */
  kind: "upcoming" | "last";
  match: Match;
}

/**
 * El partido que se destaca en el inicio: el próximo (hoy cuenta) o, si no queda
 * ninguno, el último jugado. `today` y `held_on` son `YYYY-MM-DD`, que se ordenan como texto.
 */
export function pickFeaturedMatch(matches: readonly Match[], today: string): FeaturedMatch | null {
  const upcoming = matches
    .filter((match) => match.held_on >= today)
    .sort((a, b) => a.held_on.localeCompare(b.held_on));
  if (upcoming.length > 0) return { kind: "upcoming", match: upcoming[0] };

  const past = [...matches].sort((a, b) => b.held_on.localeCompare(a.held_on));
  return past.length > 0 ? { kind: "last", match: past[0] } : null;
}
