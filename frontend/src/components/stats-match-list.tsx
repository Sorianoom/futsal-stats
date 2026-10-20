"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Match } from "@/lib/api/match-types";
import { listMatches } from "@/lib/api/matches";
import { formatShortDay } from "@/lib/weeks";

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
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-3xl font-bold">Estadísticas</h1>

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
