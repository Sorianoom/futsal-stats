import { Badge } from "@/components/ui/badge";
import type { Callup, RankedPlayer } from "@/lib/api/types";
import { POSITION_LABEL, SANCTION_LABEL } from "@/lib/labels";

interface Tag {
  label: string;
  variant: "default" | "secondary" | "outline" | "destructive";
}

function tagsOf(callup: Callup, player: RankedPlayer): Tag[] {
  if (player.excluded) return [{ label: SANCTION_LABEL[player.excluded], variant: "destructive" }];

  const id = player.player_id;
  const tags: Tag[] = [];
  if (callup.starters.guaranteed.includes(id)) {
    tags.push({ label: "Titular", variant: "default" });
  } else if (callup.field.guaranteed.includes(id) || callup.goalkeepers.guaranteed.includes(id)) {
    tags.push({ label: "Convocado", variant: "secondary" });
  }
  const tiedAnywhere = [callup.field, callup.goalkeepers, callup.starters].some((selection) =>
    selection.tied.includes(id),
  );
  if (tiedAnywhere) tags.push({ label: "Empate", variant: "outline" });
  return tags;
}

interface CallupRankingProps {
  callup: Callup;
  onSelect: (player: RankedPlayer) => void;
}

export function CallupRanking({ callup, onSelect }: CallupRankingProps) {
  return (
    <ul aria-label="Ranking" className="grid gap-3 lg:grid-cols-2">
      {callup.ranking.map((player) => {
        const tags = tagsOf(callup, player);
        const spoken = [`${player.points} puntos`, ...tags.map((tag) => tag.label)].join(", ");
        return (
          <li key={player.player_id}>
            <button
              type="button"
              aria-label={`Ver desglose de ${player.name}: ${spoken}`}
              onClick={() => onSelect(player)}
              className="flex min-h-16 w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left active:bg-muted [@media(hover:hover)]:hover:bg-muted"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                {player.dorsal}
              </span>
              <span className="flex-1">
                <span className="block text-lg font-medium">{player.name}</span>
                <span className="block text-muted-foreground">{POSITION_LABEL[player.position]}</span>
              </span>
              <span className="flex items-center gap-2">
                {tags.map((tag) => (
                  <Badge key={tag.label} variant={tag.variant}>
                    {tag.label}
                  </Badge>
                ))}
              </span>
              <span className="w-14 text-right text-2xl font-bold tabular-nums">{player.points}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
