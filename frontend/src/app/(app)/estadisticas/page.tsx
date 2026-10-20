"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { MatchStatsView } from "@/components/match-stats-view";
import { StatsMatchList } from "@/components/stats-match-list";

// El export estático no admite rutas dinámicas con id: el partido va en `?id=`.
function EstadisticasRoute() {
  const matchId = useSearchParams().get("id");
  return matchId ? <MatchStatsView key={matchId} matchId={matchId} /> : <StatsMatchList />;
}

export default function EstadisticasPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <EstadisticasRoute />
    </Suspense>
  );
}
