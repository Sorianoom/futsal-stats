"use client";

import { RoundLineup } from "@/components/fantasy/round-lineup";
import { Button } from "@/components/ui/button";
import type { StandingsRound, StandingsRow } from "@/lib/api/fantasy-types";
import { fantasyParticipantRoundQuery, fantasyStandingsQuery } from "@/lib/queries";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";

interface RoundTeamsProps {
  round: StandingsRound;
  myId: string | null;
  selected: string | null;
  onSelect: (participantId: string) => void;
}

function pointsIn(row: StandingsRow, round: StandingsRound): number {
  return row.points_by_round[round.match_id] ?? 0;
}

/** Todos los participantes con sus puntos en la jornada; tocar uno abre lo que alineó. */
export function RoundTeams({ round, myId, selected, onSelect }: RoundTeamsProps) {
  const { data: standings } = useApiQuery(fantasyStandingsQuery.key, fantasyStandingsQuery.fetch);
  if (standings === null) return null;
  const rows = [...standings.rows].sort((a, b) => pointsIn(b, round) - pointsIn(a, round));

  return (
    <section aria-labelledby="round-teams-heading" className="space-y-2">
      <h3 id="round-teams-heading" className="font-extrabold">
        Equipos de esta jornada
      </h3>
      <ul aria-label="Equipos de esta jornada" className="space-y-1.5">
        {rows.map((row) => {
          const mine = row.participant_id === myId;
          return (
            <li key={row.participant_id}>
              <button
                type="button"
                aria-pressed={selected === row.participant_id}
                onClick={() => onSelect(row.participant_id)}
                className={cn(
                  "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [@media(hover:hover)]:hover:bg-muted",
                  selected === row.participant_id && "border-primary bg-primary/10",
                )}
              >
                <span className="truncate font-bold">{mine ? `${row.display_name} (tú)` : row.display_name}</span>
                <span className="font-extrabold tabular-nums">{`${pointsIn(row, round)} pts`}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface OtherLineupProps {
  matchId: string;
  participantId: string;
  name: string;
}

/** Lo que alineó otro participante en la jornada (al empezar el partido). */
export function OtherLineup({ matchId, participantId, name }: OtherLineupProps) {
  const query = fantasyParticipantRoundQuery(matchId, participantId);
  const { data, failed, reload } = useApiQuery(query.key, query.fetch);

  if (failed && data === null) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border p-4">
        <p>{`No se pudo cargar la alineación de ${name}`}</p>
        <Button variant="outline" onClick={reload}>
          Reintentar
        </Button>
      </div>
    );
  }
  if (data === null) return <p className="text-muted-foreground">Cargando…</p>;
  if (data.private) return <p className="text-muted-foreground">Su plantilla es privada: no se ve su alineación.</p>;
  return <RoundLineup round={data.round} label={`Alineación de ${name}`} />;
}
