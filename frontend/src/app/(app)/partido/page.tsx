"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { MatchList } from "@/components/match-list";
import { MatchScreen } from "@/components/match-screen";

// El export estático no admite rutas dinámicas con id: el partido va en `?id=`.
function PartidoRoute() {
  const matchId = useSearchParams().get("id");
  return matchId ? <MatchScreen key={matchId} matchId={matchId} /> : <MatchList />;
}

export default function PartidoPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <PartidoRoute />
    </Suspense>
  );
}
