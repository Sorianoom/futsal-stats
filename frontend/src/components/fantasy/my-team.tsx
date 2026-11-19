import { LineupEditor } from "@/components/fantasy/lineup-editor";
import { NextRoundCard } from "@/components/fantasy/next-round-card";
import { SquadList } from "@/components/fantasy/squad-list";
import type { FantasyLeagueView } from "@/lib/api/fantasy-types";

/** Pestaña «Mi equipo»: próxima jornada, alineación y plantilla con sus ventas. */
export function MyTeam({ view, onChanged }: { view: FantasyLeagueView; onChanged: () => void }) {
  return (
    <>
      <NextRoundCard round={view.next_round} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <LineupEditor squad={view.squad} lineup={view.lineup} lastRound={view.last_round} onSaved={onChanged} />
        <SquadList squad={view.squad} balance={view.me.balance} onChanged={onChanged} />
      </div>
    </>
  );
}
