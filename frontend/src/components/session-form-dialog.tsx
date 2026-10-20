"use client";

import { useState, type FormEvent } from "react";

import { BusyDialog } from "@/components/busy-dialog";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import { createSession } from "@/lib/api/points";
import type { SessionKind, TeamSession } from "@/lib/api/types";
import { SELECT_CLASS } from "@/lib/form-styles";
import { SESSION_KIND_LABEL } from "@/lib/labels";
import { todayInMadrid } from "@/lib/weeks";

const SAVE_ERROR = "No se pudo crear la sesión. Inténtalo de nuevo.";
const UNCERTAIN_ERROR =
  "Sin conexión. Puede que la sesión se haya creado. Revisa la lista antes de volver a intentarlo.";

function failureMessage(failure: unknown): string {
  if (!(failure instanceof ApiError)) return SAVE_ERROR;
  return failure.code === "network" ? UNCERTAIN_ERROR : failure.message;
}

interface FormProps {
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onClose: () => void;
  onCreated: (session: TeamSession) => void;
}

function SessionForm({ busy, setBusy, onClose, onCreated }: FormProps) {
  const [kind, setKind] = useState<SessionKind>("training");
  const [date, setDate] = useState(() => todayInMadrid());
  const [notes, setNotes] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!date) {
      setDateError("Indica la fecha");
      return;
    }
    setDateError(null);
    setServerError(null);
    setBusy(true);
    let created: TeamSession;
    try {
      created = await createSession({ kind, held_on: date, notes: notes.trim() || null });
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
        <Label htmlFor="session-kind" className="text-base">
          Tipo
        </Label>
        <select
          id="session-kind"
          className={SELECT_CLASS}
          value={kind}
          onChange={(e) => setKind(e.target.value as SessionKind)}
        >
          {Object.entries(SESSION_KIND_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="session-date" className="text-base">
          Fecha
        </Label>
        <Input
          id="session-date"
          type="date"
          value={date}
          aria-invalid={Boolean(dateError)}
          aria-describedby={dateError ? "session-date-error" : undefined}
          onChange={(e) => setDate(e.target.value)}
        />
        {dateError ? (
          <p id="session-date-error" className="text-sm text-destructive">
            {dateError}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="session-notes" className="text-base">
          Notas (opcional)
        </Label>
        <Input id="session-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
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

interface SessionFormDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (session: TeamSession) => void;
}

export function SessionFormDialog({ open, onClose, onCreated }: SessionFormDialogProps) {
  return (
    <BusyDialog open={open} title="Nueva sesión" onClose={onClose}>
      {({ busy, setBusy }) => (
        <SessionForm busy={busy} setBusy={setBusy} onClose={onClose} onCreated={onCreated} />
      )}
    </BusyDialog>
  );
}
