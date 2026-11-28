"use client";

import { useState, type FormEvent } from "react";

import { BusyDialog } from "@/components/busy-dialog";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import { rescheduleMatch } from "@/lib/api/matches";
import { todayInMadrid } from "@/lib/weeks";

const SAVE_ERROR = "No se pudo cambiar la fecha. Comprueba la conexión e inténtalo de nuevo.";

function failureMessage(failure: unknown): string {
  // Los rechazos del servidor (fecha pasada, partido ya empezado) ya vienen explicados.
  return failure instanceof ApiError && failure.code !== "network" ? failure.message : SAVE_ERROR;
}

interface FormProps {
  matchId: string;
  heldOn: string;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onClose: () => void;
  onSaved: () => void;
}

function RescheduleForm({ matchId, heldOn, busy, setBusy, onClose, onSaved }: FormProps) {
  const [date, setDate] = useState(heldOn);
  const [error, setError] = useState<string | null>(null);
  const today = todayInMadrid();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!date) {
      setError("Indica la fecha");
      return;
    }
    if (date < today) {
      setError("La nueva fecha no puede ser anterior a hoy");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await rescheduleMatch(matchId, date);
    } catch (failure) {
      setError(failureMessage(failure));
      setBusy(false);
      return;
    }
    setBusy(false);
    onSaved();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-muted-foreground">
        Si es oficial, su jornada del Fantasy se mueve con él: las alineaciones se bloquean al empezar el
        partido en su nuevo día.
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="reschedule-date" className="text-base">
          Nueva fecha
        </Label>
        <Input
          id="reschedule-date"
          type="date"
          min={today}
          value={date}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "reschedule-error" : undefined}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      {error ? (
        <p id="reschedule-error" role="alert" className="text-base text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="cta" disabled={busy || date === heldOn}>
          Cambiar fecha
        </Button>
      </DialogFooter>
    </form>
  );
}

interface RescheduleMatchDialogProps {
  open: boolean;
  matchId: string;
  heldOn: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Cambia el día de un partido que aún no ha empezado. */
export function RescheduleMatchDialog({ open, matchId, heldOn, onClose, onSaved }: RescheduleMatchDialogProps) {
  return (
    <BusyDialog open={open} title="Cambiar la fecha del partido" onClose={onClose}>
      {({ busy, setBusy }) => (
        <RescheduleForm
          matchId={matchId}
          heldOn={heldOn}
          busy={busy}
          setBusy={setBusy}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </BusyDialog>
  );
}
