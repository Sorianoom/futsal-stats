"use client";

import { useState } from "react";

import { BusyDialog } from "@/components/busy-dialog";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { setMatchOfficial } from "@/lib/api/matches";
import { cn } from "@/lib/utils";

const CHANGE_ERROR = "No se pudo cambiar el tipo de partido. Comprueba la conexión e inténtalo de nuevo.";

interface ConfirmProps {
  matchId: string;
  toOfficial: boolean;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onClose: () => void;
  onChanged: () => void;
}

function ConfirmChange({ matchId, toOfficial, busy, setBusy, onClose, onChanged }: ConfirmProps) {
  const [error, setError] = useState<string | null>(null);
  const action = toOfficial ? "Marcar como oficial" : "Marcar como amistoso";

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      await setMatchOfficial(matchId, toOfficial);
    } catch {
      setError(CHANGE_ERROR);
      setBusy(false);
      return;
    }
    setBusy(false);
    onChanged();
  }

  return (
    <div className="space-y-4">
      <p>
        {toOfficial
          ? "Pasará a ser una jornada del Fantasy y puntuará con las alineaciones de los participantes."
          : "Dejará de ser una jornada del Fantasy: sus puntos no contarán en la clasificación."}
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
        <Button type="button" variant="cta" disabled={busy} onClick={() => void handleConfirm()}>
          {action}
        </Button>
      </DialogFooter>
    </div>
  );
}

interface MatchOfficialToggleProps {
  matchId: string;
  isOfficial: boolean;
  /** Solo el personal técnico puede cambiarlo; el jugador solo ve la etiqueta. */
  canChange: boolean;
  onChanged: () => void;
}

/** Si el partido cuenta para el Fantasy, y el botón para cambiarlo. */
export function MatchOfficialToggle({ matchId, isOfficial, canChange, onChanged }: MatchOfficialToggleProps) {
  const [confirming, setConfirming] = useState(false);
  const action = isOfficial ? "Marcar como amistoso" : "Marcar como oficial";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p
        className={cn(
          "rounded-2xl px-4 py-2.5 text-base font-bold",
          isOfficial ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {isOfficial ? "Oficial · cuenta para el Fantasy" : "Amistoso · no cuenta para el Fantasy"}
      </p>
      {canChange ? (
        <>
          <Button variant="outline" className="min-h-12 rounded-2xl px-5 font-bold" onClick={() => setConfirming(true)}>
            {action}
          </Button>
          <BusyDialog open={confirming} title={`¿${action}?`} onClose={() => setConfirming(false)}>
            {({ busy, setBusy }) => (
              <ConfirmChange
                matchId={matchId}
                toOfficial={!isOfficial}
                busy={busy}
                setBusy={setBusy}
                onClose={() => setConfirming(false)}
                onChanged={() => {
                  setConfirming(false);
                  onChanged();
                }}
              />
            )}
          </BusyDialog>
        </>
      ) : null}
    </div>
  );
}
