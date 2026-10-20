"use client";

import { useState, type FormEvent } from "react";

import { BusyDialog } from "@/components/busy-dialog";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import type { Match } from "@/lib/api/match-types";
import { createMatch } from "@/lib/api/matches";
import { useIdempotencyKey } from "@/lib/idempotency";
import { todayInMadrid } from "@/lib/weeks";

const MAX_OPPONENT_LENGTH = 100;
const SAVE_ERROR = "No se pudo crear el partido. Inténtalo de nuevo.";
const UNCERTAIN_ERROR =
  "Sin conexión. Puede que el partido se haya creado. Revisa la lista antes de volver a intentarlo.";

function failureMessage(failure: unknown): string {
  if (!(failure instanceof ApiError)) return SAVE_ERROR;
  return failure.code === "network" ? UNCERTAIN_ERROR : failure.message;
}

interface FormProps {
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onClose: () => void;
  onCreated: (match: Match) => void;
}

function NewMatchForm({ busy, setBusy, onClose, onCreated }: FormProps) {
  const [opponent, setOpponent] = useState("");
  const [date, setDate] = useState(() => todayInMadrid());
  const [opponentError, setOpponentError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const keyFor = useIdempotencyKey();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const name = opponent.trim();
    setOpponentError(name ? null : "Indica el rival");
    setDateError(date ? null : "Indica la fecha");
    if (!name || !date) return;

    setServerError(null);
    setBusy(true);
    let created: Match;
    try {
      created = await createMatch({ held_on: date, opponent: name }, keyFor(`${date}|${name}`));
    } catch (failure) {
      setServerError(failureMessage(failure));
      setBusy(false);
      return;
    }
    onCreated(created);
    setBusy(false);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="match-opponent" className="text-base">
          Rival
        </Label>
        <Input
          id="match-opponent"
          maxLength={MAX_OPPONENT_LENGTH}
          value={opponent}
          aria-invalid={Boolean(opponentError)}
          aria-describedby={opponentError ? "match-opponent-error" : undefined}
          onChange={(e) => setOpponent(e.target.value)}
        />
        {opponentError ? (
          <p id="match-opponent-error" className="text-sm text-destructive">
            {opponentError}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="match-date" className="text-base">
          Fecha
        </Label>
        <Input
          id="match-date"
          type="date"
          value={date}
          aria-invalid={Boolean(dateError)}
          aria-describedby={dateError ? "match-date-error" : undefined}
          onChange={(e) => setDate(e.target.value)}
        />
        {dateError ? (
          <p id="match-date-error" className="text-sm text-destructive">
            {dateError}
          </p>
        ) : null}
      </div>
      {serverError ? (
        <p role="alert" className="text-base text-destructive">
          {serverError}
        </p>
      ) : null}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          Crear
        </Button>
      </DialogFooter>
    </form>
  );
}

interface NewMatchDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (match: Match) => void;
}

export function NewMatchDialog({ open, onClose, onCreated }: NewMatchDialogProps) {
  return (
    <BusyDialog open={open} title="Nuevo partido" onClose={onClose}>
      {({ busy, setBusy }) => (
        <NewMatchForm busy={busy} setBusy={setBusy} onClose={onClose} onCreated={onCreated} />
      )}
    </BusyDialog>
  );
}
