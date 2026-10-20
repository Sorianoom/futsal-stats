"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { Movement } from "@/lib/api/types";

const UNDO_ERROR = "No se pudo deshacer el movimiento. Inténtalo de nuevo.";

const SHORT_DAY = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function signed(points: number): string {
  return points > 0 ? `+${points}` : String(points);
}

interface MovementsListProps {
  movements: Movement[];
  nameOf: (playerId: string) => string;
  onUndo: (movementId: string) => Promise<void>;
}

export function MovementsList({ movements, nameOf, onUndo }: MovementsListProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [undoneId, setUndoneId] = useState<string | null>(null);

  async function confirmUndo(movementId: string) {
    setBusy(true);
    setFailed(false);
    try {
      await onUndo(movementId);
      // La fila queda bloqueada hasta que la lista recargada deje de incluirla.
      setUndoneId(movementId);
    } catch {
      setFailed(true);
    } finally {
      setConfirmingId(null);
      setBusy(false);
    }
  }

  if (movements.length === 0) {
    return <p className="text-muted-foreground">No hay movimientos esta semana</p>;
  }

  return (
    <div className="space-y-3">
      {failed ? (
        <p role="alert" className="text-base text-destructive">
          {UNDO_ERROR}
        </p>
      ) : null}
      <ul aria-label="Movimientos" className="space-y-3">
        {movements.map((movement) => (
          <li
            key={movement.id}
            className="flex items-center gap-4 rounded-xl border bg-card p-4"
          >
            <span className="w-16 shrink-0 text-muted-foreground">
              {SHORT_DAY.format(new Date(`${movement.occurred_on}T00:00:00Z`))}
            </span>
            <span className="flex-1">
              <span className="block text-lg font-medium">{nameOf(movement.player_id)}</span>
              <span className="block text-muted-foreground">{movement.reason}</span>
            </span>
            <span
              className={`w-14 text-right text-2xl font-bold tabular-nums ${
                movement.points < 0 ? "text-destructive" : ""
              }`}
            >
              {signed(movement.points)}
            </span>
            {confirmingId === movement.id ? (
              <span className="flex gap-2">
                <Button variant="outline" disabled={busy} onClick={() => setConfirmingId(null)}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={(event) => {
                    // Un doble toque accidental no debe confirmar el borrado.
                    if (event.detail > 1) return;
                    void confirmUndo(movement.id);
                  }}
                >
                  Confirmar deshacer
                </Button>
              </span>
            ) : (
              <Button
                variant="outline"
                disabled={undoneId === movement.id}
                aria-label={`Deshacer ${nameOf(movement.player_id)}: ${movement.reason}`}
                onClick={() => setConfirmingId(movement.id)}
              >
                Deshacer
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
