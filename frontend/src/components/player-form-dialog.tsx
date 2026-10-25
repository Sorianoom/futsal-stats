"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import { createPlayer, deactivatePlayer, updatePlayer } from "@/lib/api/players";
import type { Player, PlayerStatus, Position } from "@/lib/api/types";
import { POSITION_LABEL, STATUS_LABEL } from "@/lib/labels";

const MIN_DORSAL = 0;
const MAX_DORSAL = 99;
const MAX_ALIAS_LENGTH = 30;
const SAVE_ERROR = "No se pudo guardar. Inténtalo de nuevo.";
const SELECT_CLASS =
  "h-12 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

interface FormErrors {
  name?: string;
  dorsal?: string;
}

function validate(name: string, dorsalText: string): FormErrors {
  const dorsal = Number(dorsalText);
  const validDorsal =
    dorsalText.trim() !== "" && Number.isInteger(dorsal) && dorsal >= MIN_DORSAL && dorsal <= MAX_DORSAL;
  return {
    name: name.trim() ? undefined : "Escribe el nombre",
    dorsal: validDorsal ? undefined : `Introduce un dorsal entre ${MIN_DORSAL} y ${MAX_DORSAL}`,
  };
}

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : SAVE_ERROR;
}

interface PlayerFormProps {
  player: Player | null;
  onClose: () => void;
  onSaved: () => void;
}

function PlayerForm({ player, onClose, onSaved }: PlayerFormProps) {
  const [name, setName] = useState(player?.name ?? "");
  const [alias, setAlias] = useState(player?.alias ?? "");
  const [dorsal, setDorsal] = useState(player ? String(player.dorsal) : "");
  const [position, setPosition] = useState<Position>(player?.position ?? "field");
  const [status, setStatus] = useState<PlayerStatus>(player?.status ?? "available");
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setSubmitting(true);
    setServerError(null);
    try {
      await action();
      onSaved();
    } catch (failure) {
      setServerError(messageOf(failure));
      setConfirmingRemoval(false);
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate(name, dorsal);
    setErrors(found);
    if (found.name || found.dorsal) return;
    const values = { name: name.trim(), dorsal: Number(dorsal), position };
    const trimmedAlias = alias.trim();
    // Al crear, sin alias no se envía nada; al editar, un alias vacío (`null`) lo borra.
    void run(() =>
      player
        ? updatePlayer(player.id, { ...values, alias: trimmedAlias || null, status })
        : createPlayer(trimmedAlias ? { ...values, alias: trimmedAlias } : values),
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="player-name" className="text-base">
          Nombre
        </Label>
        <Input
          id="player-name"
          value={name}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "player-name-error" : undefined}
          onChange={(e) => setName(e.target.value)}
        />
        {errors.name ? (
          <p id="player-name-error" className="text-sm text-destructive">
            {errors.name}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="player-alias" className="text-base">
          Alias
        </Label>
        <Input
          id="player-alias"
          maxLength={MAX_ALIAS_LENGTH}
          value={alias}
          aria-describedby="player-alias-hint"
          onChange={(e) => setAlias(e.target.value)}
        />
        <p id="player-alias-hint" className="text-sm text-muted-foreground">
          Opcional. Es el nombre corto que se ve en la pista y en el banquillo.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="player-dorsal" className="text-base">
          Dorsal
        </Label>
        <Input
          id="player-dorsal"
          inputMode="numeric"
          value={dorsal}
          aria-invalid={Boolean(errors.dorsal)}
          aria-describedby={errors.dorsal ? "player-dorsal-error" : undefined}
          onChange={(e) => setDorsal(e.target.value)}
        />
        {errors.dorsal ? (
          <p id="player-dorsal-error" className="text-sm text-destructive">
            {errors.dorsal}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="player-position" className="text-base">
          Posición
        </Label>
        <select
          id="player-position"
          className={SELECT_CLASS}
          value={position}
          onChange={(e) => setPosition(e.target.value as Position)}
        >
          {Object.entries(POSITION_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {player ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="player-status" className="text-base">
            Estado
          </Label>
          <select
            id="player-status"
            className={SELECT_CLASS}
            value={status}
            onChange={(e) => setStatus(e.target.value as PlayerStatus)}
          >
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <p role="status" className="sr-only">
        {confirmingRemoval ? "Pulsa de nuevo para confirmar la baja del jugador" : ""}
      </p>
      {serverError ? (
        <p role="alert" className="text-base text-destructive">
          {serverError}
        </p>
      ) : null}
      <DialogFooter className="gap-2">
        {player ? (
          <Button
            type="button"
            variant="destructive"
            disabled={submitting}
            onClick={(event) => {
              if (!confirmingRemoval) return setConfirmingRemoval(true);
              // Un doble toque accidental no debe confirmar la baja.
              if (event.detail > 1) return;
              void run(() => deactivatePlayer(player.id));
            }}
          >
            {confirmingRemoval ? "Confirmar baja" : "Dar de baja"}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          Guardar
        </Button>
      </DialogFooter>
    </form>
  );
}

interface PlayerFormDialogProps {
  player: Player | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function PlayerFormDialog({ player, open, onClose, onSaved }: PlayerFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{player ? "Editar jugador" : "Nuevo jugador"}</DialogTitle>
        </DialogHeader>
        <PlayerForm key={player?.id ?? "new"} player={player} onClose={onClose} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  );
}
