"use client";

import { useState, type FormEvent } from "react";

import { BusyDialog } from "@/components/busy-dialog";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import { registerInfraction } from "@/lib/api/points";
import type { Infraction, InfractionRegistered, NewInfraction, Player } from "@/lib/api/types";
import { SELECT_CLASS } from "@/lib/form-styles";
import { todayInMadrid } from "@/lib/weeks";

const SAVE_ERROR = "No se pudo registrar la falta. Inténtalo de nuevo.";
const UNCERTAIN_ERROR =
  "Sin conexión. Puede que la falta se haya registrado. Revisa la lista antes de volver a intentarlo.";

interface FormErrors {
  player?: string;
  infraction?: string;
  date?: string;
}

function validate(playerId: string, code: string, date: string): FormErrors {
  return {
    player: playerId ? undefined : "Elige un jugador",
    infraction: code ? undefined : "Elige una falta",
    date: date ? undefined : "Indica la fecha",
  };
}

function hasErrors(errors: FormErrors): boolean {
  return Object.values(errors).some(Boolean);
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

function failureMessage(failure: unknown): string {
  if (!(failure instanceof ApiError)) return SAVE_ERROR;
  return failure.code === "network" ? UNCERTAIN_ERROR : failure.message;
}

interface FormProps {
  players: Player[];
  infractions: Infraction[];
  onClose: () => void;
  onRegistered: (result: InfractionRegistered) => void;
}

interface InfractionFormProps extends FormProps {
  submitting: boolean;
  onSubmittingChange: (submitting: boolean) => void;
}

function InfractionForm({
  players,
  infractions,
  submitting,
  onSubmittingChange,
  onClose,
  onRegistered,
}: InfractionFormProps) {
  const [playerId, setPlayerId] = useState("");
  const [code, setCode] = useState("");
  const [date, setDate] = useState(() => todayInMadrid());
  const [inMatch, setInMatch] = useState(false);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const today = todayInMadrid();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found = validate(playerId, code, date);
    setErrors(found);
    if (hasErrors(found)) return;

    const trimmedReason = reason.trim();
    const infraction: NewInfraction = {
      player_id: playerId,
      infraction_code: code,
      occurred_on: date,
      in_match: inMatch,
      ...(trimmedReason ? { reason: trimmedReason } : {}),
    };
    onSubmittingChange(true);
    setServerError(null);
    let registered: InfractionRegistered;
    try {
      registered = await registerInfraction(infraction);
    } catch (failure) {
      setServerError(failureMessage(failure));
      onSubmittingChange(false);
      return;
    }
    onRegistered(registered);
    onSubmittingChange(false);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="infraction-player" className="text-base">
          Jugador
        </Label>
        <select
          id="infraction-player"
          className={SELECT_CLASS}
          value={playerId}
          aria-invalid={Boolean(errors.player)}
          aria-describedby={errors.player ? "infraction-player-error" : undefined}
          onChange={(e) => setPlayerId(e.target.value)}
        >
          <option value="">Selecciona un jugador</option>
          {players.map((player) => (
            <option key={player.id} value={player.id}>
              {player.dorsal} · {player.name}
            </option>
          ))}
        </select>
        <FieldError id="infraction-player-error" message={errors.player} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="infraction-code" className="text-base">
          Falta
        </Label>
        <select
          id="infraction-code"
          className={SELECT_CLASS}
          value={code}
          aria-invalid={Boolean(errors.infraction)}
          aria-describedby={errors.infraction ? "infraction-code-error" : undefined}
          onChange={(e) => setCode(e.target.value)}
        >
          <option value="">Selecciona una falta</option>
          {infractions.map((infraction) => (
            <option key={infraction.code} value={infraction.code}>
              {infraction.code} · {infraction.description} ({infraction.points})
            </option>
          ))}
        </select>
        <FieldError id="infraction-code-error" message={errors.infraction} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="infraction-date" className="text-base">
          Fecha
        </Label>
        <Input
          id="infraction-date"
          type="date"
          max={today}
          value={date}
          aria-invalid={Boolean(errors.date)}
          aria-describedby={errors.date ? "infraction-date-error" : undefined}
          onChange={(e) => setDate(e.target.value)}
        />
        <FieldError id="infraction-date-error" message={errors.date} />
      </div>
      <label className="flex min-h-12 items-center gap-3 text-base">
        <input
          type="checkbox"
          className="size-6"
          checked={inMatch}
          onChange={(e) => setInMatch(e.target.checked)}
        />
        Ocurrió en un partido
      </label>
      <div className="flex flex-col gap-2">
        <Label htmlFor="infraction-reason" className="text-base">
          Motivo (opcional)
        </Label>
        <Input id="infraction-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {serverError ? (
        <p role="alert" className="text-base text-destructive">
          {serverError}
        </p>
      ) : null}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          Registrar
        </Button>
      </DialogFooter>
    </form>
  );
}

interface InfractionFormDialogProps extends FormProps {
  open: boolean;
}

export function InfractionFormDialog({ open, onClose, ...form }: InfractionFormDialogProps) {
  return (
    <BusyDialog open={open} title="Registrar falta" onClose={onClose}>
      {({ busy, setBusy }) => (
        <InfractionForm {...form} submitting={busy} onSubmittingChange={setBusy} onClose={onClose} />
      )}
    </BusyDialog>
  );
}
