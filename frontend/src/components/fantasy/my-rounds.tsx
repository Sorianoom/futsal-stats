"use client";

import { useState } from "react";

import { RoundContent } from "@/components/fantasy/round-dialog";
import { FANTASY_CARD, FANTASY_HEADING } from "@/components/fantasy/styles";
import { Button } from "@/components/ui/button";
import type { RoundStatus, StandingsRound, StandingsRow } from "@/lib/api/fantasy-types";
import { SELECT_CLASS } from "@/lib/form-styles";
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

/** «vs Betis · 15 nov · 25 pts (provisional)» para el desplegable. */
function roundOption(round: StandingsRound, me: StandingsRow | null): string {
  const day = `vs ${round.opponent} · ${formatShortDay(round.held_on)}`;
  if (round.status === "pending") return `${day} · pendiente`;
  const points = `${me?.points_by_round[round.match_id] ?? 0} pts`;
  return round.status === "scored" ? `${day} · ${points} (provisional)` : `${day} · ${points}`;
}

/** La que se enseña al entrar: la más reciente con puntos; si ninguna tiene, la más reciente. */
function defaultRound(rounds: readonly StandingsRound[]): StandingsRound | null {
  return rounds.find((round) => round.status !== "pending") ?? rounds[0] ?? null;
}

/**
 * Pestaña «Jornadas»: la jornada en la pista, con los puntos de cada jugador y el porqué, y los
 * equipos de los demás. Arriba, un desplegable con mis puntos en cada jornada para cambiar de una.
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
      {shown ? (
        <label className="block space-y-1">
          <span className="text-sm font-bold text-muted-foreground">Jornada</span>
          <select
            aria-label="Jornada"
            value={shown.match_id}
            onChange={(event) => setSelectedId(event.target.value)}
            className={SELECT_CLASS}
          >
            {rounds.map((round) => (
              <option key={round.match_id} value={round.match_id}>
                {roundOption(round, me)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {shown ? (
        <section aria-label={`Jornada vs ${shown.opponent}`} className="space-y-3 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-extrabold">{`vs ${shown.opponent} · ${formatShortDay(shown.held_on)}`}</h3>
            <span className={cn("rounded-full px-2 text-xs font-bold", STATUS_CLASS[shown.status])}>
              {STATUS_TEXT[shown.status]}
            </span>
          </div>
          <RoundContent key={shown.match_id} round={shown} myId={myId} />
        </section>
      ) : null}
    </section>
  );
}
