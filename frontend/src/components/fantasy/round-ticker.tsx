import type { LastRound, NextRound } from "@/lib/api/fantasy-types";
import { lockText } from "@/lib/fantasy/format";

const DAY = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", timeZone: "UTC" });

function dayOf(heldOn: string): string {
  return DAY.format(new Date(`${heldOn}T00:00:00Z`)).replace(".", "");
}

const ROW = "flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm font-bold";
const BADGE = "rounded-md px-2 py-0.5 text-xs font-extrabold uppercase";

interface RoundTickerProps {
  round: NextRound | null;
  /** Jornada ya bloqueada con el partido sin cerrar (la de hoy): se enseña encima. */
  live?: LastRound | null;
}

/**
 * Franja con las rayas del club: la jornada en juego (alineación ya cerrada) si la hay y la
 * próxima, que es la que recibe la alineación que se guarde ahora.
 */
export function RoundTicker({ round, live = null }: RoundTickerProps) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div aria-hidden="true" className="club-stripes h-1.5" />
      {live ? (
        <div className={`${ROW} border-b bg-primary/10`}>
          <span className={`${BADGE} bg-primary text-primary-foreground`}>En juego</span>
          <span className="text-base font-extrabold">{`vs ${live.opponent}`}</span>
          <span className="text-muted-foreground">{dayOf(live.held_on)}</span>
          <span className="text-muted-foreground sm:ml-auto">Alineación cerrada: puntúa la que tenías a las 00:00</span>
        </div>
      ) : null}
      <div className={`${ROW} bg-gold/10`}>
        <span className={`${BADGE} bg-gold text-[#0a1633]`}>Próxima jornada</span>
        {round ? (
          <>
            <span className="text-base font-extrabold">{`vs ${round.opponent}`}</span>
            <span className="text-muted-foreground">{dayOf(round.held_on)}</span>
            <span className="text-gold-text sm:ml-auto">{lockText(round.locks_at)}</span>
          </>
        ) : (
          <span className="text-muted-foreground">No hay ninguna jornada programada</span>
        )}
      </div>
    </div>
  );
}
