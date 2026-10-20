"use client";

import { useState, type FormEvent } from "react";

import { BusyDialog } from "@/components/busy-dialog";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import { registerWins } from "@/lib/api/points";
import type { Player, TeamSession, WinKind } from "@/lib/api/types";
import { SELECT_CLASS } from "@/lib/form-styles";
import { useIdempotencyKey } from "@/lib/idempotency";
import { WIN_KIND_LABEL } from "@/lib/labels";

const SAVE_ERROR = "No se pudieron registrar las victorias. Inténtalo de nuevo.";
const UNCERTAIN_ERROR =
  "Sin conexión. Puede que las victorias se hayan registrado. Revisa Puntos antes de volver a intentarlo.";

function failureMessage(failure: unknown): string {
  if (!(failure instanceof ApiError)) return SAVE_ERROR;
  return failure.code === "network" ? UNCERTAIN_ERROR : failure.message;
}

interface FormProps {
  session: TeamSession;
  players: Player[];
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onClose: () => void;
}

function WinsForm({ session, players, busy, setBusy, onClose }: FormProps) {
  const [kind, setKind] = useState<WinKind>("exercise");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [registeredCount, setRegisteredCount] = useState<number | null>(null);
  const keyFor = useIdempotencyKey();

  function toggle(playerId: string) {
    const next = new Set(selected);
    if (!next.delete(playerId)) next.add(playerId);
    setSelected(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const playerIds = players.filter((p) => selected.has(p.id)).map((p) => p.id);
    if (playerIds.length === 0) {
      setError("Elige al menos un jugador");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await registerWins(
        session.id,
        kind,
        playerIds,
        keyFor([session.id, kind, ...playerIds].join("|")),
      );
    } catch (failure) {
      setError(failureMessage(failure));
      setBusy(false);
      return;
    }
    setRegisteredCount(playerIds.length);
    setBusy(false);
  }

  if (registeredCount !== null) {
    return (
      <div className="space-y-4">
        <p role="status" className="text-lg">
          Victoria registrada para {registeredCount} {registeredCount === 1 ? "jugador" : "jugadores"}
        </p>
        <DialogFooter>
          <Button onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="win-kind" className="text-base">
          Tipo de victoria
        </Label>
        <select
          id="win-kind"
          className={SELECT_CLASS}
          value={kind}
          onChange={(e) => setKind(e.target.value as WinKind)}
        >
          {Object.entries(WIN_KIND_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="pb-2 text-base font-medium">Jugadores</legend>
        {players.map((player) => (
          <label key={player.id} className="flex min-h-12 items-center gap-3 text-base">
            <input
              type="checkbox"
              className="size-6"
              checked={selected.has(player.id)}
              onChange={() => toggle(player.id)}
            />
            {player.name}
          </label>
        ))}
      </fieldset>
      {error ? (
        <p role="alert" className="text-base text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          Registrar
        </Button>
      </DialogFooter>
    </form>
  );
}

interface WinsDialogProps {
  session: TeamSession | null;
  players: Player[];
  onClose: () => void;
}

export function WinsDialog({ session, players, onClose }: WinsDialogProps) {
  return (
    <BusyDialog open={session !== null} title="Victorias de entreno" onClose={onClose}>
      {({ busy, setBusy }) =>
        session ? (
          <WinsForm
            key={session.id}
            session={session}
            players={players}
            busy={busy}
            setBusy={setBusy}
            onClose={onClose}
          />
        ) : null
      }
    </BusyDialog>
  );
}
