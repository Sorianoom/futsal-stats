"use client";

import { RoundLineup } from "@/components/fantasy/round-lineup";
import { Button } from "@/components/ui/button";
import type { StandingsRound, StandingsRow } from "@/lib/api/fantasy-types";
import { SELECT_CLASS } from "@/lib/form-styles";
import { PAYOUT_PER_POINT, formatMoney, payoutFor } from "@/lib/fantasy/format";
import { fantasyParticipantRoundQuery } from "@/lib/queries";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";

export function pointsIn(row: StandingsRow, round: StandingsRound): number {
  return row.points_by_round[round.match_id] ?? 0;
}

/** Participantes de más a menos puntos en la jornada. */
export function byRoundPoints(rows: readonly StandingsRow[], round: StandingsRound): StandingsRow[] {
  return [...rows].sort((a, b) => pointsIn(b, round) - pointsIn(a, round));
}

/** Puesto con empates: dos con los mismos puntos comparten puesto (1, 2, 2, 4). */
function positions(rows: readonly StandingsRow[], round: StandingsRound): number[] {
  return rows.map((row) => 1 + rows.filter((other) => pointsIn(other, round) > pointsIn(row, round)).length);
}

interface PickerProps {
  round: StandingsRound;
  rows: readonly StandingsRow[];
  myId: string | null;
  selected: string | null;
  onSelect: (participantId: string) => void;
}

/** Desplegable encima de la pista: elegir a alguien cambia la pista a su alineación. */
export function ParticipantPicker({ round, rows, myId, selected, onSelect }: PickerProps) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-bold text-muted-foreground">Ver la alineación de</span>
      <select
        aria-label="Ver la alineación de"
        value={selected ?? ""}
        onChange={(event) => onSelect(event.target.value)}
        className={SELECT_CLASS}
      >
        {rows.map((row) => (
          <option key={row.participant_id} value={row.participant_id}>
            {`${row.participant_id === myId ? `${row.display_name} (tú)` : row.display_name} · ${pointsIn(row, round)} pts`}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Ranking de lo ganado en la jornada (0,1 M por punto); tocar a uno enseña su alineación. */
export function EarningsRanking({ round, rows, myId, selected, onSelect }: PickerProps) {
  const settled = round.status === "settled";
  const places = positions(rows, round);
  return (
    <section aria-labelledby="round-earnings-heading" className="space-y-2">
      <h3 id="round-earnings-heading" className="font-extrabold">
        {settled ? "Beneficio tras la jornada" : "Beneficio provisional de la jornada"}
      </h3>
      <p className="text-sm text-muted-foreground">
        {`${settled ? "Lo que ha ganado" : "Lo que ganará al cerrarse la jornada"} cada uno: ${formatMoney(PAYOUT_PER_POINT)} por punto de su alineación (el capitán cuenta doble). Con saldo negativo al empezar el partido no puntúa ni cobra.`}
      </p>
      <ol aria-label="Beneficio tras la jornada" className="space-y-1.5">
        {rows.map((row, index) => {
          const mine = row.participant_id === myId;
          const points = pointsIn(row, round);
          return (
            <li key={row.participant_id}>
              <button
                type="button"
                aria-pressed={selected === row.participant_id}
                onClick={() => onSelect(row.participant_id)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [@media(hover:hover)]:hover:bg-muted",
                  selected === row.participant_id && "border-primary bg-primary/10",
                  mine && "shadow-[inset_4px_0_0_var(--gold)]",
                )}
              >
                <span className="w-7 shrink-0 text-center font-black text-muted-foreground tabular-nums">{`${places[index]}º`}</span>
                <span className="min-w-0 flex-1 truncate font-bold">
                  {mine ? `${row.display_name} (tú)` : row.display_name}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">{`${points} pts`}</span>
                <span className="w-16 text-right font-extrabold tabular-nums">{`+${formatMoney(payoutFor(points))}`}</span>
              </button>
            </li>
          );
        })}
      </ol>
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
