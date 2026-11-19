import { CourtSurface } from "@/components/court-surface";
import { SyncStatus } from "@/components/sync-status";
import { Button } from "@/components/ui/button";
import type { Player } from "@/lib/api/types";
import { courtSlots } from "@/lib/match/court-layout";
import { shortName } from "@/lib/player-name";
import type { LogStatus } from "@/lib/match/use-match-log";
import { cn } from "@/lib/utils";

const FOULS_WARNING_FROM = 5;
const FOUL_PIPS = [1, 2, 3, 4, 5];

interface CourtProps {
  players: readonly Player[];
  onPick: (player: Player) => void;
}

/** Los de la pista, colocados sobre la cancha donde juegan. */
function Court({ players, onPick }: CourtProps) {
  return (
    <CourtSurface title="En pista · toca un jugador" className="lg:max-h-[calc(100dvh-21rem)]">
      <ul aria-label="En pista" className="absolute inset-0">
        {courtSlots(players).map(({ player, x, y }) => {
          const keeper = player.position === "goalkeeper";
          return (
            <li
              key={player.id}
              style={{ left: `${x}%`, top: `${y}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2"
            >
              <button
                type="button"
                onClick={() => onPick(player)}
                className="flex flex-col items-center gap-2 rounded-2xl p-1 transition-transform outline-none focus-visible:ring-4 focus-visible:ring-white/70 active:scale-95"
              >
                <span
                  className={cn(
                    "flex size-20 items-center justify-center rounded-full text-4xl font-extrabold shadow-[0_6px_0_rgba(8,24,80,0.35)] xl:size-[92px]",
                    keeper ? "bg-cta text-cta-foreground" : "bg-white text-primary",
                  )}
                >
                  {player.dorsal}
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-[15px] font-extrabold text-foreground">
                  {shortName(player)}
                </span>
                {keeper ? <span className="sr-only"> (portero)</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </CourtSurface>
  );
}

interface BenchProps {
  players: readonly Player[];
  onPick: (player: Player) => void;
}

function Bench({ players, onPick }: BenchProps) {
  return (
    <section className="space-y-2.5">
      <h2 className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">
        Banquillo · toca para cambiar
      </h2>
      <ul aria-label="Banquillo" className="grid grid-cols-2 gap-2.5">
        {players.map((player) => (
          <li key={player.id}>
            <Button
              variant="outline"
              className="h-12 w-full justify-start gap-3 rounded-2xl px-3 text-[15px] font-bold"
              onClick={() => onPick(player)}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-extrabold text-secondary-foreground">
                {player.dorsal}
              </span>
              <span className="truncate">{shortName(player)}</span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface ClockControlsProps {
  text: string;
  running: boolean;
  finished: boolean;
  onToggle: () => void;
  onAdjust: () => void;
}

/** Reloj de la parte: grande, con ▶/⏸ para seguir al árbitro y «Ajustar» para cuadrarlo con la mesa. */
function ClockControls({ text, running, finished, onToggle, onAdjust }: ClockControlsProps) {
  return (
    <div className="flex items-center gap-3">
      <p
        role="timer"
        aria-label="Reloj"
        className={cn(
          "min-w-[5ch] text-6xl leading-none font-extrabold tabular-nums",
          running ? "text-background" : "text-background/60",
        )}
      >
        {text}
      </p>
      <Button
        size="icon"
        variant={running ? "outline" : "cta"}
        aria-label={running ? "Parar el reloj" : "Arrancar el reloj"}
        disabled={finished && !running}
        onClick={onToggle}
        className={cn(
          "size-16 rounded-2xl text-3xl",
          running && "border-white/25 bg-white/10 text-background hover:bg-white/20 hover:text-background",
        )}
      >
        <span aria-hidden="true">{running ? "⏸" : "▶"}</span>
      </Button>
      <Button
        variant="ghost"
        aria-label="Ajustar el reloj"
        onClick={onAdjust}
        className="h-16 rounded-2xl px-4 text-base font-bold text-background hover:bg-white/10 hover:text-background"
      >
        Ajustar
      </Button>
    </div>
  );
}

interface LivePanelProps {
  title: string;
  score: { for: number; against: number };
  teamFouls: number;
  /** Lo que marca el reloj (cuenta atrás, mm:ss). */
  clockText: string;
  clockRunning: boolean;
  /** El reloj llegó a 0:00: ya no se puede arrancar. */
  clockFinished: boolean;
  /** Aviso discreto del reloj (p. ej. va por detrás del último cambio); no es un error. */
  clockNote: string | null;
  court: readonly Player[];
  bench: readonly Player[];
  /** El portero en pista, si hay uno solo: la parada se le anota con un toque, sin abrir su ficha. */
  keeper: Player | null;
  canUndo: boolean;
  undoNote: string | null;
  /** Qué deshace el botón, p. ej. «Deshacer cambio: entra X, sale Y (12:34)». */
  undoLabel?: string | null;
  status: LogStatus;
  pending: number;
  syncProblem: string | null;
  onCourtPlayer: (player: Player) => void;
  onBenchPlayer: (player: Player) => void;
  onToggleClock: () => void;
  onAdjustClock: () => void;
  onRivalGoal: () => void;
  onSave: () => void;
  onEndPart: () => void;
  onUndo: () => void;
  onRate: () => void;
  onRetry: () => void;
  onReload: () => void;
}

export function LivePanel(props: LivePanelProps) {
  const { score, teamFouls } = props;
  const fouling = teamFouls >= FOULS_WARNING_FROM;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-foreground px-7 py-4 text-background">
        <div className="min-w-56 space-y-1.5">
          <p className="text-xs font-extrabold tracking-widest text-cta uppercase">{props.title}</p>
          <div className="flex items-center gap-3">
            <p className={cn("text-base", fouling ? "font-bold text-warning" : "text-background/80")}>
              {`Faltas de equipo: ${teamFouls}`}
            </p>
            <span aria-hidden="true" className="flex gap-1.5">
              {FOUL_PIPS.map((pip) => (
                <span
                  key={pip}
                  className={cn("h-2 w-5 rounded-full", pip <= teamFouls ? "bg-cta" : "bg-white/20")}
                />
              ))}
            </span>
          </div>
        </div>
        <p aria-label="Marcador" className="text-7xl leading-none font-extrabold tabular-nums">
          {score.for} – {score.against}
        </p>
        <ClockControls
          text={props.clockText}
          running={props.clockRunning}
          finished={props.clockFinished}
          onToggle={props.onToggleClock}
          onAdjust={props.onAdjustClock}
        />
      </header>

      {props.clockNote ? (
        <p role="status" aria-label="Aviso del reloj" className="px-2 text-sm text-muted-foreground">
          {props.clockNote}
        </p>
      ) : null}

      <SyncStatus
        status={props.status}
        pending={props.pending}
        detail={props.syncProblem}
        onRetry={props.onRetry}
        onReload={props.onReload}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Court players={props.court} onPick={props.onCourtPlayer} />

        <div className="flex flex-col gap-5">
          <Bench players={props.bench} onPick={props.onBenchPlayer} />
          <div className="mt-auto flex flex-col gap-3">
            {props.keeper ? (
              <Button
                size="lg"
                variant="outline"
                aria-label={`Parada de ${props.keeper.name}`}
                className="h-14 rounded-2xl border-2 text-lg font-extrabold"
                onClick={props.onSave}
              >
                {`Parada · ${shortName(props.keeper)}`}
              </Button>
            ) : null}
            <Button
              size="lg"
              variant="outline"
              className="h-14 rounded-2xl border-2 border-destructive text-lg font-extrabold text-destructive hover:bg-destructive/10"
              onClick={props.onRivalGoal}
            >
              Gol rival
            </Button>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-auto min-h-9 rounded-2xl py-1 text-sm leading-tight whitespace-normal"
                disabled={!props.canUndo}
                onClick={props.onUndo}
              >
                {props.undoLabel ?? "Deshacer"}
              </Button>
              <Button variant="outline" className="rounded-2xl" onClick={props.onRate}>
                Valorar quinteto
              </Button>
            </div>
            <Button size="lg" variant="cta" className="h-[60px] rounded-2xl text-xl" onClick={props.onEndPart}>
              Fin de la parte
            </Button>
            {props.undoNote ? <p className="text-sm text-muted-foreground">{props.undoNote}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
