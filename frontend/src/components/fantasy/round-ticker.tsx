import type { NextRound } from "@/lib/api/fantasy-types";
import { lockText } from "@/lib/fantasy/format";

const DAY = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", timeZone: "UTC" });

/** Franja con las rayas del club y la cinta de la próxima jornada: rival, día y cierre. */
export function RoundTicker({ round }: { round: NextRound | null }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div aria-hidden="true" className="club-stripes h-1.5" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-gold/10 px-4 py-2.5 text-sm font-bold">
        <span className="rounded-md bg-gold px-2 py-0.5 text-xs font-extrabold text-[#0a1633] uppercase">Próxima jornada</span>
        {round ? (
          <>
            <span className="text-base font-extrabold">{`vs ${round.opponent}`}</span>
            <span className="text-muted-foreground">{DAY.format(new Date(`${round.held_on}T00:00:00Z`)).replace(".", "")}</span>
            <span className="text-gold-text sm:ml-auto">{lockText(round.locks_at)}</span>
          </>
        ) : (
          <span className="text-muted-foreground">No hay ninguna jornada programada</span>
        )}
      </div>
    </div>
  );
}
