import { FANTASY_CARD, FANTASY_HEADING } from "@/components/fantasy/styles";
import type { NextRound } from "@/lib/api/fantasy-types";
import { lockText } from "@/lib/fantasy/format";
import { formatLongDay } from "@/lib/weeks";

const WEEKDAY = new Intl.DateTimeFormat("es-ES", { weekday: "short", timeZone: "UTC" });

/** Recuadro con el día de la semana y el número del día del partido. */
function DayTile({ iso }: { iso: string }) {
  const day = new Date(`${iso}T00:00:00Z`);
  return (
    <span
      aria-hidden="true"
      className="flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary/10 text-primary"
    >
      <span className="text-[11px] leading-none font-extrabold uppercase">{WEEKDAY.format(day).replace(".", "")}</span>
      <span className="text-2xl leading-none font-extrabold tabular-nums">{day.getUTCDate()}</span>
    </span>
  );
}

export function NextRoundCard({ round }: { round: NextRound | null }) {
  if (!round) {
    return (
      <div className={`${FANTASY_CARD} space-y-1`}>
        <p className={FANTASY_HEADING}>Próxima jornada</p>
        <p className="text-muted-foreground">No hay ninguna jornada programada</p>
      </div>
    );
  }
  return (
    <div className={`${FANTASY_CARD} flex flex-wrap items-center gap-3`}>
      <DayTile iso={round.held_on} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className={FANTASY_HEADING}>Próxima jornada</p>
        <p className="text-xl font-extrabold">{`vs ${round.opponent}`}</p>
        <p className="text-sm text-muted-foreground first-letter:uppercase">{formatLongDay(round.held_on)}</p>
      </div>
      <p className="rounded-full bg-cta/15 px-3 py-1.5 text-sm font-bold text-orange-900">{lockText(round.locks_at)}</p>
    </div>
  );
}
