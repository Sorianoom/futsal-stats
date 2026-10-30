"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { NewMatchDialog } from "@/components/new-match-dialog";
import { Button } from "@/components/ui/button";
import { matchesQuery } from "@/lib/queries";
import { sortMatchesByDate } from "@/lib/sort-matches";
import { useApiQuery } from "@/lib/use-api-query";
import { formatShortDay } from "@/lib/weeks";

export function MatchList() {
  const router = useRouter();
  const { data: matches, failed: loadFailed, reload: retry } = useApiQuery(matchesQuery.key, matchesQuery.fetch);
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-4xl font-extrabold tracking-tight">Partidos</h1>
        <Button size="lg" variant="cta" className="rounded-2xl" onClick={() => setCreating(true)}>
          Nuevo partido
        </Button>
      </header>

      {loadFailed ? (
        <div role="alert" className="flex items-center justify-between rounded-lg border p-4">
          <p>No se pudieron cargar los partidos</p>
          <Button variant="outline" onClick={retry}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {matches === null && !loadFailed ? (
        <p className="text-muted-foreground">Cargando partidos…</p>
      ) : null}
      {matches?.length === 0 ? (
        <p className="text-muted-foreground">Todavía no hay partidos</p>
      ) : null}

      {matches && matches.length > 0 ? (
        <ul aria-label="Partidos" className="grid gap-3 md:grid-cols-2">
          {sortMatchesByDate(matches).map((match) => (
            <li key={match.id}>
              <Link
                href={`/partido?id=${match.id}`}
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

      <NewMatchDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(created) => {
          setCreating(false);
          router.push(`/partido?id=${created.id}`);
        }}
      />
    </div>
  );
}
