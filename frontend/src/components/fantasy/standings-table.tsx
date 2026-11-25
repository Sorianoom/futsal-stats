"use client";

import { useState } from "react";

import { ParticipantDialog } from "@/components/fantasy/participant-dialog";
import { RoundDialog } from "@/components/fantasy/round-dialog";
import { MySeason, Podium, positionOf } from "@/components/fantasy/standings-highlights";
import { FANTASY_HEADING } from "@/components/fantasy/styles";
import { Button } from "@/components/ui/button";
import type { FantasyStandings, RoundStatus, StandingsRound, StandingsRow } from "@/lib/api/fantasy-types";
import { fantasyStandingsQuery } from "@/lib/queries";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";
import { formatShortDay } from "@/lib/weeks";

const HEADER = "px-3 py-3 text-left text-xs font-extrabold tracking-wider text-muted-foreground uppercase";
const CELL = "px-3 py-3 text-base tabular-nums";
/** Primera columna fija al desplazar en el móvil. */
const STICKY = "sticky left-0 z-10 bg-inherit";

function roundCell(round: StandingsRound, row: StandingsRow): string {
  if (round.status === "pending") return "—";
  return String(row.points_by_round[round.match_id] ?? 0);
}

/** Marca de las jornadas que aún no están cerradas; las cerradas (`settled`) no llevan. */
const ROUND_MARK: Partial<Record<RoundStatus, { text: string; className: string }>> = {
  pending: { text: "Pendiente", className: "bg-muted text-muted-foreground" },
  scored: { text: "Provisional", className: "bg-cta/20 text-foreground" },
};

/** Cabecera de una jornada: se puede tocar si quien mira tiene equipo (`onOpen`). */
function RoundHeader({ round, onOpen }: { round: StandingsRound; onOpen?: () => void }) {
  const mark = ROUND_MARK[round.status];
  const content = (
    <>
      <span className="text-sm font-extrabold">{round.opponent}</span>
      <span className="text-xs text-muted-foreground">{formatShortDay(round.held_on)}</span>
      {mark ? (
        <span className={cn("mt-0.5 rounded-full px-2 text-xs font-bold", mark.className)}>{mark.text}</span>
      ) : null}
    </>
  );
  return (
    <th scope="col" className="px-1 py-2 text-left align-bottom">
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex min-h-11 flex-col items-start rounded-xl px-2 py-1 text-left whitespace-nowrap focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [@media(hover:hover)]:hover:bg-muted"
        >
          {content}
        </button>
      ) : (
        <span className="flex min-h-11 flex-col items-start px-2 py-1 whitespace-nowrap">{content}</span>
      )}
    </th>
  );
}

interface TableProps {
  standings: FantasyStandings;
  /** null: quien mira no juega (cuenta de partidos del cuerpo técnico). */
  myId: string | null;
  onOpenRound?: (round: StandingsRound) => void;
  onOpenParticipant: (row: StandingsRow) => void;
}

function Table({ standings, myId, onOpenRound, onOpenParticipant }: TableProps) {
  return (
    <div role="region" aria-label="Tabla de clasificación" tabIndex={0} className="overflow-x-auto rounded-3xl border bg-card">
      <table aria-label="Clasificación" className="w-full border-collapse bg-card">
        <thead>
          <tr>
            <th scope="col" className={HEADER}>#</th>
            <th scope="col" className={cn(HEADER, STICKY)}>Participante</th>
            <th scope="col" className={HEADER}>Total</th>
            {standings.rounds.map((round) => (
              <RoundHeader
                key={round.match_id}
                round={round}
                onOpen={onOpenRound ? () => onOpenRound(round) : undefined}
              />
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
                className={cn("border-t bg-card", mine && "bg-gold/15 shadow-[inset_4px_0_0_var(--gold)]")}
              >
                <td className={`${CELL} font-bold text-muted-foreground`}>{positionOf(standings.rows, row)}</td>
                <th scope="row" className={cn(CELL, STICKY, "text-left font-bold whitespace-nowrap")}>
                  <button
                    type="button"
                    onClick={() => onOpenParticipant(row)}
                    className="-mx-2 min-h-11 rounded-xl px-2 text-left font-bold underline decoration-muted-foreground/40 underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [@media(hover:hover)]:hover:bg-muted"
                  >
                    {row.display_name}
                  </button>
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
                    className={cn(
                      CELL,
                      round.status === "pending" && "text-muted-foreground",
                      round.status === "scored" && "italic",
                    )}
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

/**
 * Clasificación de la liga. Tocar una jornada abre mi alineación de esa jornada y tocar un nombre,
 * el equipo de ese participante; sin `myId` (quien solo mira, sin equipo) no hay alineación propia
 * que abrir ni temporada propia.
 */
export function Standings({ myId }: { myId: string | null }) {
  const { data: standings, failed, reload } = useApiQuery(fantasyStandingsQuery.key, fantasyStandingsQuery.fetch);
  const [openRound, setOpenRound] = useState<StandingsRound | null>(null);
  const [openRow, setOpenRow] = useState<StandingsRow | null>(null);

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
          <p className="text-sm text-muted-foreground">
            {standings.rounds.length === 0
              ? "Toca un nombre para ver su equipo."
              : myId
                ? "Toca una jornada para ver tu alineación y la de los demás, o un nombre para ver su equipo. Las provisionales se congelan al cerrarse la jornada."
                : "Toca una jornada para ver lo que alineó cada uno, o un nombre para ver su equipo."}
          </p>
          {standings.rounds.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no se ha jugado ninguna jornada.</p>
          ) : null}
          <Podium rows={standings.rows} myId={myId ?? ""} />
          {myId ? <MySeason standings={standings} myId={myId} /> : null}
          <Table
            standings={standings}
            myId={myId}
            onOpenRound={setOpenRound}
            onOpenParticipant={setOpenRow}
          />
        </>
      ) : null}
      <RoundDialog round={openRound} myId={myId} onClose={() => setOpenRound(null)} />
      <ParticipantDialog row={openRow} onClose={() => setOpenRow(null)} />
    </section>
  );
}
