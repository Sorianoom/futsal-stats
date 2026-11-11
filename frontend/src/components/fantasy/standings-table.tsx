"use client";

import { useState } from "react";

import { RoundDialog } from "@/components/fantasy/round-dialog";
import { FANTASY_HEADING } from "@/components/fantasy/styles";
import { Button } from "@/components/ui/button";
import type { FantasyStandings, StandingsRound, StandingsRow } from "@/lib/api/fantasy-types";
import { fantasyStandingsQuery } from "@/lib/queries";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";
import { formatShortDay } from "@/lib/weeks";

const HEADER = "px-3 py-3 text-left text-xs font-extrabold tracking-wider text-muted-foreground uppercase";
const CELL = "px-3 py-3 text-base tabular-nums";
/** Primera columna fija al desplazar en el móvil. */
const STICKY = "sticky left-0 z-10 bg-inherit";

/** Puesto con empates: el mismo total comparte puesto (1, 1, 3…). */
function positionOf(rows: readonly StandingsRow[], row: StandingsRow): number {
  return 1 + rows.filter((other) => other.total > row.total).length;
}

function roundCell(round: StandingsRound, row: StandingsRow): string {
  if (round.status === "pending") return "—";
  return String(row.points_by_round[round.match_id] ?? 0);
}

function RoundHeader({ round, onOpen }: { round: StandingsRound; onOpen: () => void }) {
  const pending = round.status === "pending";
  return (
    <th scope="col" className="px-1 py-2 text-left align-bottom">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-11 flex-col items-start rounded-xl px-2 py-1 text-left whitespace-nowrap focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [@media(hover:hover)]:hover:bg-muted"
      >
        <span className="text-sm font-extrabold">{round.opponent}</span>
        <span className="text-xs text-muted-foreground">{formatShortDay(round.held_on)}</span>
        {pending ? (
          <span className="mt-0.5 rounded-full bg-muted px-2 text-xs font-bold text-muted-foreground">Pendiente</span>
        ) : null}
      </button>
    </th>
  );
}

interface TableProps {
  standings: FantasyStandings;
  myId: string;
  onOpenRound: (round: StandingsRound) => void;
}

function Table({ standings, myId, onOpenRound }: TableProps) {
  return (
    <div role="region" aria-label="Tabla de clasificación" tabIndex={0} className="overflow-x-auto rounded-3xl border bg-card">
      <table aria-label="Clasificación" className="w-full border-collapse bg-card">
        <thead>
          <tr>
            <th scope="col" className={HEADER}>#</th>
            <th scope="col" className={cn(HEADER, STICKY)}>Participante</th>
            <th scope="col" className={HEADER}>Total</th>
            {standings.rounds.map((round) => (
              <RoundHeader key={round.match_id} round={round} onOpen={() => onOpenRound(round)} />
            ))}
          </tr>
        </thead>
        <tbody>
          {standings.rows.map((row) => {
            const mine = row.participant_id === myId;
            return (
              <tr
                key={row.participant_id}
                aria-current={mine ? "true" : undefined}
                className={cn("border-t bg-card", mine && "bg-primary/10")}
              >
                <td className={`${CELL} font-bold text-muted-foreground`}>{positionOf(standings.rows, row)}</td>
                <th scope="row" className={cn(CELL, STICKY, "text-left font-bold whitespace-nowrap")}>
                  {row.display_name}
                  {mine ? (
                    <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-extrabold text-primary-foreground">
                      Tú
                    </span>
                  ) : null}
                </th>
                <td className={`${CELL} text-lg font-extrabold`}>{row.total}</td>
                {standings.rounds.map((round) => (
                  <td
                    key={round.match_id}
                    className={cn(CELL, round.status === "pending" && "text-muted-foreground")}
                  >
                    {roundCell(round, row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Clasificación de la liga. Tocar una jornada abre mi alineación de esa jornada. */
export function Standings({ myId }: { myId: string }) {
  const { data: standings, failed, reload } = useApiQuery(fantasyStandingsQuery.key, fantasyStandingsQuery.fetch);
  const [openRound, setOpenRound] = useState<StandingsRound | null>(null);

  return (
    <section aria-labelledby="standings-heading" className="space-y-3">
      <h2 id="standings-heading" className={FANTASY_HEADING}>
        Clasificación
      </h2>
      {failed ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border p-4">
          <p>No se pudo cargar la clasificación</p>
          <Button variant="outline" onClick={reload}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {standings === null && !failed ? <p className="text-muted-foreground">Cargando clasificación…</p> : null}
      {standings ? (
        <>
          {standings.rounds.length > 0 ? (
            <p className="text-sm text-muted-foreground">Toca una jornada para ver tu alineación y sus puntos.</p>
          ) : (
            <p className="text-sm text-muted-foreground">Aún no se ha jugado ninguna jornada.</p>
          )}
          <Table standings={standings} myId={myId} onOpenRound={setOpenRound} />
        </>
      ) : null}
      <RoundDialog round={openRound} onClose={() => setOpenRound(null)} />
    </section>
  );
}
