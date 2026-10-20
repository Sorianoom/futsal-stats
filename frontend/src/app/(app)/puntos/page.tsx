"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { InfractionFormDialog } from "@/components/infraction-form-dialog";
import { MovementsList } from "@/components/movements-list";
import { RegistrationResult } from "@/components/registration-result";
import { Button } from "@/components/ui/button";
import { WeekNavigator } from "@/components/week-navigator";
import { ApiError } from "@/lib/api/client";
import { deleteMovement, listInfractions, listMovements } from "@/lib/api/points";
import { listPlayers } from "@/lib/api/players";
import type { Infraction, InfractionRegistered, Movement, Player } from "@/lib/api/types";
import { currentWeekStart } from "@/lib/weeks";

const NOT_FOUND = 404;

interface Reference {
  players: Player[];
  infractions: Infraction[];
}

interface LoadedMovements {
  week: string;
  items: Movement[];
}

export default function PuntosPage() {
  const { user } = useAuth();
  const isHeadCoach = user?.role === "head_coach";
  const [week, setWeek] = useState(() => currentWeekStart());
  const [reference, setReference] = useState<Reference | null>(null);
  const [loadedMovements, setLoadedMovements] = useState<LoadedMovements | null>(null);
  const [referenceFailed, setReferenceFailed] = useState(false);
  const [movementsFailed, setMovementsFailed] = useState(false);
  const [referenceKey, setReferenceKey] = useState(0);
  const [movementsKey, setMovementsKey] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [result, setResult] = useState<InfractionRegistered | null>(null);

  // Solo se muestran los movimientos de la semana visible: nunca los de otra.
  const movements = loadedMovements?.week === week ? loadedMovements.items : null;

  useEffect(() => {
    if (!isHeadCoach) return;
    let active = true;
    Promise.all([listPlayers(true), listInfractions()])
      .then(([players, infractions]) => {
        if (!active) return;
        setReference({ players, infractions });
        setReferenceFailed(false);
      })
      .catch(() => {
        if (active) setReferenceFailed(true);
      });
    return () => {
      active = false;
    };
  }, [isHeadCoach, referenceKey]);

  useEffect(() => {
    if (!isHeadCoach) return;
    let active = true;
    listMovements(week)
      .then((items) => {
        if (!active) return;
        setLoadedMovements({ week, items });
        setMovementsFailed(false);
      })
      .catch(() => {
        if (active) setMovementsFailed(true);
      });
    return () => {
      active = false;
    };
  }, [week, movementsKey, isHeadCoach]);

  const loadFailed = referenceFailed || movementsFailed;

  function reloadMovements() {
    setMovementsKey((key) => key + 1);
  }

  function retry() {
    if (referenceFailed) {
      setReferenceFailed(false);
      setReferenceKey((key) => key + 1);
    }
    if (movementsFailed) {
      setMovementsFailed(false);
      reloadMovements();
    }
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
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Puntos</h1>
        <WeekNavigator
          week={week}
          onChange={(next) => {
            setWeek(next);
            setMovementsFailed(false);
          }}
        />
      </header>

      <Button size="lg" disabled={reference === null} onClick={() => setFormOpen(true)}>
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
