"use client";

import { useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { BreakdownDialog } from "@/components/breakdown-dialog";
import { CallupRanking } from "@/components/callup-ranking";
import { CallupSummary } from "@/components/callup-summary";
import { Button } from "@/components/ui/button";
import { WeekNavigator } from "@/components/week-navigator";
import { callupQuery } from "@/lib/queries";
import { useApiQuery } from "@/lib/use-api-query";
import { currentWeekStart } from "@/lib/weeks";

export default function ConvocatoriaPage() {
  const { user } = useAuth();
  const isHeadCoach = user?.role === "head_coach";
  const [week, setWeek] = useState(() => currentWeekStart());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // La clave lleva la semana: nunca se muestran datos de otra semana.
  const request = callupQuery(week);
  const {
    data: callup,
    failed: loadFailed,
    reload: retry,
  } = useApiQuery(isHeadCoach ? request.key : null, request.fetch);
  const selected = callup?.ranking.find((player) => player.player_id === selectedId) ?? null;

  function openBreakdown(playerId: string) {
    setSelectedId(playerId);
    setDialogOpen(true);
  }

  if (!isHeadCoach) {
    return <p className="text-lg">Solo el entrenador puede ver la convocatoria</p>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-extrabold tracking-tight">Convocatoria</h1>
        <WeekNavigator week={week} onChange={setWeek} />
      </header>

      {loadFailed ? (
        <div role="alert" className="flex items-center justify-between rounded-lg border p-4">
          <p>No se pudo cargar la convocatoria</p>
          <Button variant="outline" onClick={retry}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {callup === null && !loadFailed ? (
        <p role="status" className="text-muted-foreground">
          Cargando convocatoria…
        </p>
      ) : null}

      {callup ? (
        <>
          <CallupSummary callup={callup} />
          <CallupRanking callup={callup} onSelect={(player) => openBreakdown(player.player_id)} />
          <BreakdownDialog
            open={dialogOpen}
            playerName={selected?.name ?? null}
            breakdown={selected ? (callup.breakdowns[selected.player_id] ?? null) : null}
            onClose={() => setDialogOpen(false)}
          />
        </>
      ) : null}
    </div>
  );
}
