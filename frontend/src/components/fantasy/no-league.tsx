"use client";

import { useState } from "react";

import { BusyDialog } from "@/components/busy-dialog";
import { FANTASY_CARD } from "@/components/fantasy/styles";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/client";
import { createLeague } from "@/lib/api/fantasy";

const CREATE_ERROR = "No se pudo crear la liga. Comprueba la conexión e inténtalo de nuevo.";

interface ConfirmProps {
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onClose: () => void;
  onCreated: () => void;
}

function ConfirmCreate({ busy, setBusy, onClose, onCreated }: ConfirmProps) {
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      await createLeague();
    } catch (failure) {
      // Si ya existía, lo que el usuario quería ya está hecho: se carga la liga.
      const exists = failure instanceof ApiError && failure.code === "league_exists";
      if (!exists) {
        setError(CREATE_ERROR);
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    onCreated();
  }

  return (
    <div className="space-y-4">
      <p>
        Se repartirán <strong>2 jugadores de campo al azar</strong> a cada cuenta activa (entrenadores y
        jugadores), sin repetir jugador en una misma plantilla.
      </p>
      <p className="text-muted-foreground">
        Cada participante empieza con 20,0 M. La liga dura toda la temporada y no se puede deshacer.
      </p>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" variant="cta" disabled={busy} onClick={() => void handleCreate()}>
          Crear liga
        </Button>
      </DialogFooter>
    </div>
  );
}

interface NoLeagueProps {
  canCreate: boolean;
  onCreated: () => void;
}

/** Sin liga: el entrenador principal puede crearla; el resto espera. */
export function NoLeague({ canCreate, onCreated }: NoLeagueProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className={`${FANTASY_CARD} space-y-4`}>
      <p className="text-lg font-bold">Todavía no hay liga esta temporada.</p>
      {canCreate ? (
        <>
          <p className="text-muted-foreground">
            Al crearla, todas las cuentas activas entran en la clasificación con su plantilla inicial.
          </p>
          <Button size="lg" variant="cta" className="rounded-2xl" onClick={() => setConfirming(true)}>
            Crear liga
          </Button>
        </>
      ) : (
        <p className="text-muted-foreground">El entrenador principal la creará pronto.</p>
      )}
      <BusyDialog open={confirming} title="Crear liga" onClose={() => setConfirming(false)}>
        {({ busy, setBusy }) => (
          <ConfirmCreate
            busy={busy}
            setBusy={setBusy}
            onClose={() => setConfirming(false)}
            onCreated={() => {
              setConfirming(false);
              onCreated();
            }}
          />
        )}
      </BusyDialog>
    </div>
  );
}
