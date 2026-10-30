"use client";

import { useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { InfractionFormDialog } from "@/components/infraction-form-dialog";
import { MovementsList } from "@/components/movements-list";
import { RegistrationResult } from "@/components/registration-result";
import { Button } from "@/components/ui/button";
import { WeekNavigator } from "@/components/week-navigator";
import { ApiError } from "@/lib/api/client";
import { deleteMovement } from "@/lib/api/points";
import type { InfractionRegistered } from "@/lib/api/types";
import { movementsQuery, pointsReferenceQuery } from "@/lib/queries";
import { useApiQuery } from "@/lib/use-api-query";
import { currentWeekStart } from "@/lib/weeks";

const NOT_FOUND = 404;

export default function PuntosPage() {
  const { user } = useAuth();
  const isHeadCoach = user?.role === "head_coach";
  const [week, setWeek] = useState(() => currentWeekStart());
  const [formOpen, setFormOpen] = useState(false);
  const [result, setResult] = useState<InfractionRegistered | null>(null);

  const {
    data: reference,
    failed: referenceFailed,
    reload: reloadReference,
  } = useApiQuery(isHeadCoach ? pointsReferenceQuery.key : null, pointsReferenceQuery.fetch);
  // La clave lleva la semana: nunca se muestran movimientos de otra semana.
  const movementsRequest = movementsQuery(week);
  const {
    data: movements,
    failed: movementsFailed,
    reload: reloadMovements,
  } = useApiQuery(isHeadCoach ? movementsRequest.key : null, movementsRequest.fetch);

  const loadFailed = referenceFailed || movementsFailed;

  function retry() {
    if (referenceFailed) reloadReference();
    if (movementsFailed) reloadMovements();
  }

  function handleRegistered(registered: InfractionRegistered) {
    setFormOpen(false);
    setResult(registered);
    reloadMovements();
  }

  async function handleUndo(movementId: string) {
    try {
      await deleteMovement(movementId);
    } catch (failure) {
      // Si ya no existe, el resultado es el deseado: solo se refresca la lista.
      if (!(failure instanceof ApiError && failure.status === NOT_FOUND)) throw failure;
    }
    reloadMovements();
  }

  if (!isHeadCoach) {
    return <p className="text-lg">Solo el entrenador puede gestionar los puntos</p>;
  }

  const names = new Map(reference?.players.map((player) => [player.id, player.name]));
  const nameOf = (playerId: string) => names.get(playerId) ?? "Jugador desconocido";
  const activePlayers = reference?.players.filter((player) => player.is_active) ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-extrabold tracking-tight">Puntos</h1>
        <WeekNavigator week={week} onChange={setWeek} />
      </header>

      <Button variant="cta" size="lg" className="rounded-2xl" disabled={reference === null} onClick={() => setFormOpen(true)}>
        Registrar falta
      </Button>

      {result && reference ? (
        <RegistrationResult
          result={result}
          playerName={nameOf(result.movement.player_id)}
          infractions={reference.infractions}
          visibleWeek={week}
          onDismiss={() => setResult(null)}
        />
      ) : null}

      {loadFailed ? (
        <div role="alert" className="flex items-center justify-between rounded-lg border p-4">
          <p>No se pudo cargar los movimientos</p>
          <Button variant="outline" onClick={retry}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {(movements === null || reference === null) && !loadFailed ? (
        <p className="text-muted-foreground">Cargando movimientos…</p>
      ) : null}

      {movements && reference ? (
        <MovementsList movements={movements} nameOf={nameOf} onUndo={handleUndo} />
      ) : null}

      {reference ? (
        <InfractionFormDialog
          open={formOpen}
          players={activePlayers}
          infractions={reference.infractions}
          onClose={() => setFormOpen(false)}
          onRegistered={handleRegistered}
        />
      ) : null}
    </div>
  );
}
