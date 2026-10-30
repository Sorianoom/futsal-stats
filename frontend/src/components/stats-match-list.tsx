"use client";

import Link from "next/link";

import { SeasonStatsTable } from "@/components/stats-tables";
import { Button } from "@/components/ui/button";
import { matchesQuery, seasonStatsQuery } from "@/lib/queries";
import { useApiQuery } from "@/lib/use-api-query";
import { formatShortDay } from "@/lib/weeks";

function Season() {
  const { data: season, failed, reload } = useApiQuery(seasonStatsQuery.key, seasonStatsQuery.fetch);

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Temporada</h2>
      {failed ? (
        <div role="alert" className="flex items-center justify-between rounded-lg border p-4">
          <p>No se pudo cargar el acumulado</p>
          <Button
            variant="outline"
            onClick={reload}
          >
            Reintentar
          </Button>
        </div>
      ) : null}
      {season === null && !failed ? (
        <p className="text-muted-foreground">Cargando acumulado…</p>
      ) : null}
      {season && season.matches === 0 ? (
        <p className="text-muted-foreground">
          Todavía no hay partidos cerrados: el acumulado aparece al cerrar el primero.
        </p>
      ) : null}
      {season?.warnings.map((warning) => (
        <p key={warning} className="rounded-lg border p-3 text-muted-foreground">
          {warning}
        </p>
      ))}
      {season && season.matches > 0 ? (
        <>
          <p className="text-muted-foreground">
            {`Acumulado de ${season.matches} ${season.matches === 1 ? "partido cerrado" : "partidos cerrados"}`}
          </p>
          <SeasonStatsTable players={season.players} />
        </>
      ) : null}
    </section>
  );
}

export function StatsMatchList() {
  const { data: matches, failed, reload } = useApiQuery(matchesQuery.key, matchesQuery.fetch);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-3xl font-bold">Estadísticas</h1>

      <Season />

      <h2 className="text-xl font-semibold">Partidos</h2>

      {failed ? (
        <div role="alert" className="flex items-center justify-between rounded-lg border p-4">
          <p>No se pudieron cargar los partidos</p>
          <Button
            variant="outline"
            onClick={reload}
          >
            Reintentar
          </Button>
        </div>
      ) : null}
      {matches === null && !failed ? (
        <p className="text-muted-foreground">Cargando partidos…</p>
      ) : null}
      {matches?.length === 0 ? <p className="text-muted-foreground">Todavía no hay partidos</p> : null}

      {matches && matches.length > 0 ? (
        <ul aria-label="Partidos" className="space-y-3">
          {matches.map((match) => (
            <li key={match.id}>
              <Link
                href={`/estadisticas?id=${match.id}`}
                className="flex min-h-16 items-center gap-4 rounded-xl border bg-card p-4 active:bg-muted [@media(hover:hover)]:hover:bg-muted"
              >
                <span className="w-20 shrink-0 text-muted-foreground">{formatShortDay(match.held_on)}</span>
                <span className="text-lg font-medium">{match.opponent}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
