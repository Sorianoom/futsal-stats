"use client";

import { useState, type FormEvent } from "react";

import { InvitationLink } from "@/components/invitation-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createFantasyInvitation,
  deactivateFantasyAccount,
  listFantasyAccounts,
  type FantasyAccount,
} from "@/lib/api/fantasy-accounts";
import type { Invitation } from "@/lib/api/types";
import { useApiQuery } from "@/lib/use-api-query";

const ACCOUNTS_KEY = "fantasy-accounts";
const MAX_NAME_LENGTH = 40;

function InviteForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Escribe el nombre con el que saldrá en la clasificación.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      setInvitation(await createFantasyInvitation(trimmed));
    } catch {
      setError("No se pudo crear la invitación. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (invitation) {
    return (
      <div className="flex flex-col gap-4">
        <InvitationLink invitation={invitation} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
      <p className="text-base text-muted-foreground">
        Cuenta solo para jugar al Fantasy, aparte de la de partidos. Su plantilla es privada: nadie ve qué jugadores
        ficha ni se los puede clausular, y ella tampoco clausula.
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="fantasy-account-name" className="text-base">
          Nombre en la clasificación
        </Label>
        <Input
          id="fantasy-account-name"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="off"
          placeholder="Bruno"
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      {error ? (
        <p role="alert" className="text-base text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creando…" : "Crear enlace"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function AccountRow({ account, onRemoved }: { account: FantasyAccount; onRemoved: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const name = account.display_name ?? account.email;

  async function handleRemove() {
    setFailed(false);
    try {
      await deactivateFantasyAccount(account.id);
      onRemoved();
    } catch {
      setFailed(true);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{name}</span>
        <span className="block truncate text-sm text-muted-foreground">{account.email}</span>
      </span>
      {confirming ? (
        <span className="flex gap-2">
          <Button variant="outline" onClick={() => setConfirming(false)}>
            No
          </Button>
          <Button variant="destructive" onClick={() => void handleRemove()}>
            {`Quitar a ${name}`}
          </Button>
        </span>
      ) : (
        <Button variant="ghost" onClick={() => setConfirming(true)}>
          Quitar
        </Button>
      )}
      {failed ? (
        <p role="alert" className="w-full text-sm text-destructive">
          No se pudo quitar la cuenta. Inténtalo de nuevo.
        </p>
      ) : null}
    </li>
  );
}

/** Plantilla: cuentas del Fantasy del cuerpo técnico (solo el entrenador principal). */
export function FantasyAccountsSection() {
  const { data, failed, reload } = useApiQuery(ACCOUNTS_KEY, listFantasyAccounts);
  const [inviting, setInviting] = useState(false);

  function close() {
    setInviting(false);
    reload();
  }

  return (
    <section aria-labelledby="fantasy-accounts-heading" className="space-y-2 rounded-3xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="fantasy-accounts-heading" className="text-xl font-extrabold">
          Cuentas del Fantasy del cuerpo técnico
        </h2>
        <Button variant="outline" onClick={() => setInviting(true)}>
          Invitar
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Para que el entrenador y el segundo entrenador jueguen al Fantasy con la plantilla privada. Con su cuenta de
        partidos solo ven la clasificación.
      </p>
      {failed ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border p-4">
          <p>No se pudieron cargar las cuentas</p>
          <Button variant="outline" onClick={reload}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {data && data.length === 0 ? <p className="text-muted-foreground">Aún no hay ninguna.</p> : null}
      {data && data.length > 0 ? (
        <ul aria-label="Cuentas del Fantasy del cuerpo técnico" className="divide-y">
          {data.map((account) => (
            <AccountRow key={account.id} account={account} onRemoved={reload} />
          ))}
        </ul>
      ) : null}
      <Dialog open={inviting} onOpenChange={(next) => (next ? undefined : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invitar a una cuenta del Fantasy</DialogTitle>
          </DialogHeader>
          {inviting ? <InviteForm onClose={close} /> : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
