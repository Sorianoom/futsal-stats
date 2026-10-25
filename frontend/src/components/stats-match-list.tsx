"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SeasonStatsTable } from "@/components/stats-tables";
import { Button } from "@/components/ui/button";
import type { Match } from "@/lib/api/match-types";
import { listMatches } from "@/lib/api/matches";
import { getSeasonStats } from "@/lib/api/stats";
import type { SeasonPlayerStats, SeasonStats } from "@/lib/api/stats-types";
import { formatClock } from "@/lib/match/clock";
import { seasonLeaders, type Leader } from "@/lib/season-leaders";
import { formatShortDay } from "@/lib/weeks";

function leaderValue(leader: Leader): string {
  return leader.id === "seconds" ? formatClock(leader.value) : String(leader.value);
}

/** Quién lidera cada categoría de la temporada, en tarjetas. */
function Leaders({ players }: { players: readonly SeasonPlayerStats[] }) {
  const leaders = seasonLeaders(players);
  if (leaders.length === 0) return null;
  return (
    <ul aria-label="Líderes de la temporada" className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-3">
      {leaders.map((leader) => (
        <li key={leader.id} className="space-y-1 rounded-3xl bg-foreground p-5 text-background">
          <p className="text-xs font-extrabold tracking-widest text-cta uppercase">{leader.label}</p>
          <p className="text-4xl leading-none font-extrabold tabular-nums">{leaderValue(leader)}</p>
          <p className="text-base font-bold text-background/80">{leader.names.join(", ")}</p>
        </li>
      ))}
    </ul>
  );
}

function Season() {
  const [season, setSeason] = useState<SeasonStats | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    getSeasonStats()
      .then((loaded) => {
        if (!active) return;
        setSeason(loaded);
        setFailed(false);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">Temporada</h2>
      {failed ? (
        <div role="alert" className="flex items-center justify-between rounded-lg border p-4">
          <p>No se pudo cargar el acumulado</p>
          <Button
            variant="outline"
            onClick={() => {
              setFailed(false);
              setReloadKey((key) => key + 1);
            }}
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
          <Leaders players={season.players} />
          <SeasonStatsTable players={season.players} />
        </>
      ) : null}
    </section>
  );
}

export function StatsMatchList() {
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    listMatches()
      .then((list) => {
        if (!active) return;
        setMatches(list);
        setFailed(false);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-4xl font-extrabold tracking-tight">Estadísticas</h1>

      <Season />

      <h2 className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">Partidos</h2>

      {failed ? (
        <div role="alert" className="flex items-center justify-between rounded-lg border p-4">
          <p>No se pudieron cargar los partidos</p>
          <Button
            variant="outline"
            onClick={() => {
              setFailed(false);
              setReloadKey((key) => key + 1);
            }}
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
        <ul aria-label="Partidos" className="grid gap-3 md:grid-cols-2">
          {matches.map((match) => (
            <li key={match.id}>
              <Link
                href={`/estadisticas?id=${match.id}`}
                className="flex min-h-20 items-center gap-4 rounded-3xl border-2 bg-card p-4 transition-colors active:bg-muted [@media(hover:hover)]:hover:border-primary"
              >
                <span className="w-24 shrink-0 rounded-2xl bg-primary/10 px-2 py-3 text-center text-base font-extrabold text-primary">
                  {formatShortDay(match.held_on)}
                </span>
                <span className="flex-1 text-xl font-extrabold">{match.opponent}</span>
                <span aria-hidden="true" className="text-2xl font-bold text-muted-foreground">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
