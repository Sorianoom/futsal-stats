"use client";

import { useState } from "react";

import { RoundDialog } from "@/components/fantasy/round-dialog";
import { FANTASY_CARD, FANTASY_HEADING } from "@/components/fantasy/styles";
import { Button } from "@/components/ui/button";
import type { RoundStatus, StandingsRound } from "@/lib/api/fantasy-types";
import { fantasyStandingsQuery } from "@/lib/queries";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";
import { formatShortDay } from "@/lib/weeks";

const STATUS_TEXT: Record<RoundStatus, string> = {
  pending: "Pendiente",
  scored: "Provisional",
  settled: "Cerrada",
};

const STATUS_CLASS: Record<RoundStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  scored: "bg-cta/20 text-foreground",
  settled: "bg-primary/15 text-foreground",
};

/** Pestaña «Jornadas»: mis puntos en cada jornada; tocar una abre mi alineación con el detalle. */
export function MyRounds({ myId }: { myId: string }) {
  const { data: standings, failed, reload } = useApiQuery(fantasyStandingsQuery.key, fantasyStandingsQuery.fetch);
  const [open, setOpen] = useState<StandingsRound | null>(null);
  const me = standings?.rows.find((row) => row.participant_id === myId) ?? null;
  // La más reciente arriba.
  const rounds = standings ? [...standings.rounds].reverse() : [];

  return (
    <section aria-labelledby="my-rounds-heading" className={`${FANTASY_CARD} space-y-3`}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="my-rounds-heading" className={FANTASY_HEADING}>
          Mis jornadas
        </h2>
        {me ? <p className="text-lg font-extrabold tabular-nums">{`Total: ${me.total} pts`}</p> : null}
      </div>
      {failed ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border p-4">
          <p>No se pudieron cargar tus jornadas</p>
          <Button variant="outline" onClick={reload}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {standings === null && !failed ? <p className="text-muted-foreground">Cargando jornadas…</p> : null}
      {standings && rounds.length === 0 ? (
        <p className="text-muted-foreground">Aún no se ha jugado ninguna jornada.</p>
      ) : null}
      {rounds.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">Toca una jornada para ver tu alineación y los puntos de cada jugador.</p>
          <ul aria-label="Mis puntos por jornada" className="space-y-2">
            {rounds.map((round) => {
              const points = round.status === "pending" ? null : (me?.points_by_round[round.match_id] ?? 0);
              return (
                <li key={round.match_id}>
                  <button
                    type="button"
                    onClick={() => setOpen(round)}
                    className="flex min-h-16 w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [@media(hover:hover)]:hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-extrabold">{`vs ${round.opponent}`}</span>
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        {formatShortDay(round.held_on)}
                        <span className={cn("rounded-full px-2 text-xs font-bold", STATUS_CLASS[round.status])}>
                          {STATUS_TEXT[round.status]}
                        </span>
                      </span>
                    </span>
                    <span className="text-2xl font-black tabular-nums">{points === null ? "—" : `${points} pts`}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      <RoundDialog round={open} myId={myId} onClose={() => setOpen(null)} />
    </section>
  );
}
