"use client";

import { useState } from "react";

import { BusyDialog } from "@/components/busy-dialog";
import { KeypadBody } from "@/components/time-keypad";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import type { StintRecord } from "@/lib/api/match-types";
import { createStint, updateStint, type StintChanges } from "@/lib/api/stints";
import type { Player } from "@/lib/api/types";
import { SELECT_CLASS } from "@/lib/form-styles";
import { elapsedToDisplay, formatClock, type ClockSettings } from "@/lib/match/clock";

const SAVE_ERROR = "No se pudo guardar el tramo. Inténtalo de nuevo.";

export type StintTarget = { kind: "add" } | { kind: "edit"; stint: StintRecord };

interface FormProps {
  matchId: string;
  target: StintTarget;
  players: readonly Player[];
  settings: ClockSettings;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onClose: () => void;
  onSaved: () => void;
}

type EditingTime = "start" | "end" | null;

function StintForm({ matchId, target, players, settings, busy, setBusy, onClose, onSaved }: FormProps) {
  const original = target.kind === "edit" ? target.stint : null;
  const [playerId, setPlayerId] = useState(original?.player_id ?? "");
  const [part, setPart] = useState(original?.part ?? 1);
  const [startS, setStartS] = useState(original?.start_s ?? 0);
  const [endS, setEndS] = useState(original?.end_s ?? settings.partSeconds);
  const [editing, setEditing] = useState<EditingTime>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = (elapsed: number) => formatClock(elapsedToDisplay(elapsed, settings));

  async function save() {
    if (busy) return;
    if (!original && !playerId) {
      setError("Elige un jugador");
      return;
    }
    if (endS <= startS) {
      setError("La salida tiene que ser posterior a la entrada");
      return;
    }
    const changes: StintChanges = {
      ...(original && part !== original.part ? { part } : {}),
      ...(original && startS !== original.start_s ? { start_s: startS } : {}),
      ...(original && endS !== original.end_s ? { end_s: endS } : {}),
    };
    if (original && Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (original) await updateStint(original.id, changes);
      else await createStint(matchId, { player_id: playerId, part, start_s: startS, end_s: endS });
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : SAVE_ERROR);
      setBusy(false);
      return;
    }
    onSaved();
    setBusy(false);
  }

  if (editing !== null) {
    return (
      <KeypadBody
        settings={settings}
        initialElapsed={editing === "start" ? startS : endS}
        onConfirm={(elapsed) => {
          if (editing === "start") setStartS(elapsed);
          else setEndS(elapsed);
          setError(null);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="stint-player" className="text-base">
          Jugador
        </Label>
        <select
          id="stint-player"
          className={SELECT_CLASS}
          value={playerId}
          disabled={original !== null}
          onChange={(e) => setPlayerId(e.target.value)}
        >
          <option value="">Selecciona un jugador</option>
          {players.map((player) => (
            <option key={player.id} value={player.id}>
              {player.dorsal} · {player.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="stint-part" className="text-base">
          Parte
        </Label>
        <select
          id="stint-part"
          className={SELECT_CLASS}
          value={part}
          onChange={(e) => setPart(Number(e.target.value))}
        >
          <option value={1}>1ª parte</option>
          <option value={2}>2ª parte</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" size="lg" onClick={() => setEditing("start")}>
          {`Entra: ${shown(startS)}`}
        </Button>
        <Button variant="outline" size="lg" onClick={() => setEditing("end")}>
          {`Sale: ${shown(endS)}`}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-base text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter className="gap-2">
        <Button variant="outline" disabled={busy} onClick={onClose}>
          Cancelar
        </Button>
        <Button disabled={busy} onClick={() => void save()}>
          Guardar
        </Button>
      </DialogFooter>
    </div>
  );
}

interface StintDialogProps {
  matchId: string;
  target: StintTarget | null;
  players: readonly Player[];
  settings: ClockSettings;
  onClose: () => void;
  onSaved: () => void;
}

export function StintDialog({ target, onClose, ...rest }: StintDialogProps) {
  const title = target?.kind === "edit" ? "Editar tramo" : "Añadir tramo";
  return (
    <BusyDialog open={target !== null} title={title} onClose={onClose}>
      {({ busy, setBusy }) =>
        target ? (
          <StintForm
            key={target.kind === "edit" ? target.stint.id : "add"}
            target={target}
            busy={busy}
            setBusy={setBusy}
            onClose={onClose}
            {...rest}
          />
        ) : null
      }
    </BusyDialog>
  );
}
