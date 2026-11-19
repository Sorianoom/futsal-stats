"use client";

import { useState } from "react";

import { PlayerAvatar } from "@/components/player-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deletePlayerPhoto, uploadPlayerPhoto } from "@/lib/api/players";
import type { Player } from "@/lib/api/types";
import { squarePhoto } from "@/lib/photo";

const UPLOAD_ERROR = "No se pudo subir la foto. Prueba con otra imagen o inténtalo de nuevo.";
const DELETE_ERROR = "No se pudo quitar la foto. Inténtalo de nuevo.";

interface PlayerPhotoDialogProps {
  player: Player | null;
  onClose: () => void;
  /** Tras subir o quitar: la plantilla se recarga para enseñar la foto nueva. */
  onChanged: () => void;
}

/** Subir, cambiar o quitar la foto de un jugador (solo el entrenador principal). */
export function PlayerPhotoDialog({ player, onClose, onChanged }: PlayerPhotoDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setError(null);
    onClose();
  }

  async function run(action: () => Promise<unknown>, failure: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
      onClose();
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  function handleFile(file: File | undefined) {
    if (!player || !file) return;
    void run(async () => uploadPlayerPhoto(player.id, await squarePhoto(file)), UPLOAD_ERROR);
  }

  return (
    <Dialog open={player !== null} onOpenChange={(open) => (open ? null : close())}>
      <DialogContent>
        {player ? (
          <>
            <DialogHeader>
              <DialogTitle>{`Foto de ${player.name}`}</DialogTitle>
              <DialogDescription>Se recorta en cuadrado. Sale en su ficha y en el Fantasy.</DialogDescription>
            </DialogHeader>
            <div className="flex justify-center">
              <PlayerAvatar
                name={player.name}
                dorsal={player.dorsal}
                photoUrl={player.photo_url}
                className="size-36 bg-secondary text-5xl text-primary"
              />
            </div>
            {error ? (
              <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm font-semibold text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex flex-col gap-2">
              <label
                className="inline-flex h-12 cursor-pointer items-center justify-center rounded-xl bg-primary px-4 font-bold text-primary-foreground has-[:disabled]:opacity-50 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
              >
                {busy ? "Subiendo…" : player.photo_url ? "Cambiar foto" : "Elegir foto"}
                <input
                  type="file"
                  accept="image/*"
                  aria-label="Elegir foto"
                  className="sr-only"
                  disabled={busy}
                  onChange={(event) => {
                    handleFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
              {player.photo_url ? (
                <Button
                  variant="outline"
                  className="h-12 rounded-xl"
                  disabled={busy}
                  onClick={() => void run(() => deletePlayerPhoto(player.id), DELETE_ERROR)}
                >
                  Quitar foto
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
