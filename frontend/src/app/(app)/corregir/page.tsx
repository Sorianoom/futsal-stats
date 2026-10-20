"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { CorrectMatch } from "@/components/correct-match";

// El export estático no admite rutas dinámicas con id: el partido va en `?id=`.
function CorregirRoute() {
  const matchId = useSearchParams().get("id");
  if (!matchId) {
    return (
      <div className="space-y-4">
        <p className="text-lg">Elige un partido para corregirlo</p>
        <Link href="/estadisticas" className="inline-flex min-h-12 items-center px-3 underline">
          Ir a las estadísticas
        </Link>
      </div>
    );
  }
  return <CorrectMatch key={matchId} matchId={matchId} />;
}

export default function CorregirPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <CorregirRoute />
    </Suspense>
  );
}
