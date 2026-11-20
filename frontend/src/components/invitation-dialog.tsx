"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import { createInvitation } from "@/lib/api/players";
import type { Invitation, Player } from "@/lib/api/types";

const CREATE_ERROR = "No se pudo crear la invitación. Inténtalo de nuevo.";
const COPY_ERROR = "No se pudo copiar. Mantén pulsado el enlace para copiarlo a mano.";
const ALREADY_HAS_ACCOUNT = "already_has_account";
const PLAYER_INACTIVE = "player_inactive";

const EXPIRY_FORMAT = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Madrid",
});

/**
 * Enlace a la página pública de invitación. La barra final es la de `trailingSlash`.
 * El token va en el fragmento: el navegador no lo envía al servidor ni en `Referer`.
 */
export function invitationLink(token: string): string {
  return `${window.location.origin}/invitacion/#token=${encodeURIComponent(token)}`;
}

type CopyState = "idle" | "copied" | "failed";

export function InvitationLink({ invitation }: { invitation: Invitation }) {
  const [copy, setCopy] = useState<CopyState>("idle");
  const link = invitationLink(invitation.token);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor="invitation-link" className="text-base">
        Enlace de invitación
      </Label>
      <div className="flex gap-2">
        <Input
          id="invitation-link"
          readOnly
          value={link}
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1"
        />
        <Button type="button" variant="cta" className="h-12 shrink-0 rounded-xl px-5" onClick={() => void handleCopy()}>
          {copy === "copied" ? "Copiado" : "Copiar enlace"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {`Caduca el ${EXPIRY_FORMAT.format(new Date(invitation.expires_at))}. Solo sirve una vez.`}
      </p>
      {copy === "failed" ? (
        <p role="alert" className="text-sm text-destructive">
          {COPY_ERROR}
        </p>
      ) : null}
    </div>
  );
}

interface InvitationFormProps {
  player: Player;
  onClose: () => void;
  onRosterStale: () => void;
}

function InvitationForm({ player, onClose, onRosterStale }: InvitationFormProps) {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate() {
    setSubmitting(true);
    setError(null);
    try {
      setInvitation(await createInvitation(player.id));
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === ALREADY_HAS_ACCOUNT) {
        setError(`${player.name} ya tiene cuenta: no hace falta invitarle.`);
        onRosterStale();
      } else if (failure instanceof ApiError && failure.code === PLAYER_INACTIVE) {
        setError(`${player.name} está dado de baja: no se le puede invitar.`);
        onRosterStale();
      } else {
        setError(CREATE_ERROR);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {invitation ? (
        <InvitationLink invitation={invitation} />
      ) : (
        <p className="text-base text-muted-foreground">
          {`Se creará un enlace de un solo uso para que ${player.name} elija su correo y contraseña. Envíaselo por el medio que prefieras.`}
        </p>
      )}
      {error ? (
        <p role="alert" className="text-base text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cerrar
        </Button>
        {invitation ? null : (
          <Button type="button" disabled={submitting} onClick={() => void handleCreate()}>
            {submitting ? "Creando…" : "Crear enlace"}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}

interface InvitationDialogProps {
  player: Player | null;
  onClose: () => void;
  /** El servidor dice que ya tiene cuenta o está de baja: la plantilla está desactualizada. */
  onRosterStale: () => void;
}

export function InvitationDialog({ player, onClose, onRosterStale }: InvitationDialogProps) {
  return (
    <Dialog open={player !== null} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{player ? `Invitar a ${player.name}` : "Invitar"}</DialogTitle>
        </DialogHeader>
        {player ? (
          <InvitationForm
            key={player.id}
            player={player}
            onClose={onClose}
            onRosterStale={onRosterStale}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
