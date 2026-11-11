import type { Match } from "@/lib/api/match-types";

/** Etiqueta «Amistoso» en las listas de partidos; los oficiales no llevan nada. */
export function FriendlyBadge({ match }: { match: Pick<Match, "is_official"> }) {
  // Una copia local anterior al campo no lo trae: se trata como oficial, que es lo habitual.
  if (match.is_official !== false) return null;
  return (
    <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-sm font-bold text-muted-foreground">
      Amistoso
    </span>
  );
}
