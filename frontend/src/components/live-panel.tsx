import { SyncStatus } from "@/components/sync-status";
import { Button } from "@/components/ui/button";
import type { Player } from "@/lib/api/types";
import type { ClockDirection } from "@/lib/match/clock";
import type { LogStatus } from "@/lib/match/use-match-log";
import { cn } from "@/lib/utils";

const FOULS_WARNING_FROM = 5;

interface PlayerCardsProps {
  label: string;
  players: readonly Player[];
  onPick: (player: Player) => void;
  emphasis: boolean;
}

function PlayerCards({ label, players, onPick, emphasis }: PlayerCardsProps) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{label}</h2>
      <ul aria-label={label} className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {players.map((player) => (
          <li key={player.id}>
            <Button
              variant={emphasis ? "default" : "outline"}
              className="h-20 w-full flex-col gap-0 text-lg"
              onClick={() => onPick(player)}
            >
              <span className="block">{player.name}</span>
              <span className="block text-sm font-normal opacity-80">{player.dorsal}</span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface LivePanelProps {
  title: string;
  score: { for: number; against: number };
  teamFouls: number;
  clockText: string;
  direction: ClockDirection;
  court: readonly Player[];
  bench: readonly Player[];
  canUndo: boolean;
  undoNote: string | null;
  status: LogStatus;
  pending: number;
  syncProblem: string | null;
  onCourtPlayer: (player: Player) => void;
  onBenchPlayer: (player: Player) => void;
  onClock: () => void;
  onToggleDirection: () => void;
  onRivalGoal: () => void;
  onUndo: () => void;
  onRate: () => void;
  onRetry: () => void;
  onReload: () => void;
}

export function LivePanel(props: LivePanelProps) {
  const { score, teamFouls, direction } = props;
  const toggleLabel =
    direction === "down"
      ? "Marcador hacia abajo. Cambiar a hacia arriba"
      : "Marcador hacia arriba. Cambiar a hacia abajo";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xl font-semibold">{props.title}</p>
          <p
            className={cn(
              "text-base",
              teamFouls >= FOULS_WARNING_FROM ? "font-semibold text-destructive" : "text-muted-foreground",
            )}
          >
            {`Faltas de equipo: ${teamFouls}`}
          </p>
        </div>
        <p aria-label="Marcador" className="text-5xl font-bold tabular-nums">
          {score.for} – {score.against}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="lg"
            aria-label={`Marcador a ${props.clockText}. Tocar para corregir`}
            onClick={props.onClock}
          >
            {props.clockText}
          </Button>
          <Button variant="ghost" size="lg" aria-label={toggleLabel} onClick={props.onToggleDirection}>
            {direction === "down" ? "↓" : "↑"}
          </Button>
        </div>
      </div>

      <SyncStatus
        status={props.status}
        pending={props.pending}
        detail={props.syncProblem}
        onRetry={props.onRetry}
        onReload={props.onReload}
      />

      <PlayerCards label="En pista" players={props.court} onPick={props.onCourtPlayer} emphasis />
      <PlayerCards label="Banquillo" players={props.bench} onPick={props.onBenchPlayer} emphasis={false} />

      <div className="flex flex-wrap gap-3">
        <Button size="lg" variant="secondary" onClick={props.onRivalGoal}>
          Gol rival
        </Button>
        <Button size="lg" variant="outline" disabled={!props.canUndo} onClick={props.onUndo}>
          Deshacer
        </Button>
        <Button size="lg" variant="outline" onClick={props.onRate}>
          Valorar quinteto
        </Button>
      </div>
      {props.undoNote ? <p className="text-sm text-muted-foreground">{props.undoNote}</p> : null}
    </div>
  );
}
