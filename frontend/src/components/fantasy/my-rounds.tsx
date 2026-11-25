"use client";

import { useState } from "react";

import { RoundContent } from "@/components/fantasy/round-dialog";
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

/** La que se enseña al entrar: la más reciente con puntos; si ninguna tiene, la más reciente. */
function defaultRound(rounds: readonly StandingsRound[]): StandingsRound | null {
  return rounds.find((round) => round.status !== "pending") ?? rounds[0] ?? null;
}

/**
 * Pestaña «Jornadas»: la jornada en la pista, con los puntos de cada jugador y el porqué, y los
 * equipos de los demás. Arriba, mis puntos en cada jornada para cambiar de una a otra.
 */
export function MyRounds({ myId }: { myId: string }) {
  const { data: standings, failed, reload } = useApiQuery(fantasyStandingsQuery.key, fantasyStandingsQuery.fetch);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const me = standings?.rows.find((row) => row.participant_id === myId) ?? null;
  // La más reciente primero.
  const rounds = standings ? [...standings.rounds].reverse() : [];
  const shown = rounds.find((round) => round.match_id === selectedId) ?? defaultRound(rounds);

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
        <ul aria-label="Mis puntos por jornada" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {rounds.map((round) => {
            const points = round.status === "pending" ? null : (me?.points_by_round[round.match_id] ?? 0);
            const current = round.match_id === shown?.match_id;
            return (
              <li key={round.match_id} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={current}
                  onClick={() => setSelectedId(round.match_id)}
                  className={cn(
                    "flex min-h-16 min-w-36 flex-col items-start rounded-2xl border bg-card px-3 py-2 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [@media(hover:hover)]:hover:bg-muted",
                    current && "border-gold bg-gold/15 shadow-[inset_0_-3px_0_var(--gold)]",
                  )}
                >
                  <span className="block max-w-40 truncate font-extrabold">{`vs ${round.opponent}`}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {formatShortDay(round.held_on)}
                    <span className={cn("rounded-full px-2 font-bold", STATUS_CLASS[round.status])}>
                      {STATUS_TEXT[round.status]}
                    </span>
                  </span>
                  <span className="text-xl font-black tabular-nums">{points === null ? "—" : `${points} pts`}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {shown ? (
        <section aria-label={`Jornada vs ${shown.opponent}`} className="space-y-3 pt-2">
          <h3 className="text-lg font-extrabold">{`vs ${shown.opponent} · ${formatShortDay(shown.held_on)}`}</h3>
          <RoundContent key={shown.match_id} round={shown} myId={myId} />
        </section>
      ) : null}
    </section>
  );
}
