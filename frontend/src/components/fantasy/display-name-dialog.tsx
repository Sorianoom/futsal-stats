"use client";

import { useState, type FormEvent } from "react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateMyName } from "@/lib/api/auth";

const SAVE_ERROR = "No se pudo guardar el nombre. Inténtalo de nuevo.";
const MAX_LENGTH = 40;

interface DisplayNameDialogProps {
  /** Cómo sale ahora en la liga. */
  current: string;
  /** Tras guardar: se recarga el Fantasy para enseñar el nombre nuevo. */
  onChanged: () => void;
}

/** Botón «Tu nombre» para los entrenadores, que no tienen ficha de jugador con nombre. */
export function DisplayNameDialog({ current, onChanged }: DisplayNameDialogProps) {
  const { replaceUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(current);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  function show() {
    setName(current);
    setFailed(false);
    setOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFailed(false);
    try {
      const trimmed = name.trim();
      replaceUser(await updateMyName(trimmed === "" ? null : trimmed));
      onChanged();
      setOpen(false);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="outline" className="max-w-56 rounded-xl" onClick={show}>
        <span className="truncate">{`Tu nombre: ${current}`}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tu nombre en el Fantasy</DialogTitle>
            <DialogDescription>Es como te verán los demás en la clasificación y en los fichajes.</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="display-name">Nombre</Label>
              <Input
                id="display-name"
                value={name}
                maxLength={MAX_LENGTH}
                autoComplete="nickname"
                onChange={(event) => setName(event.target.value)}
              />
              <p className="text-sm text-muted-foreground">Si lo dejas vacío, se usa tu email.</p>
            </div>
            {failed ? (
              <p role="alert" className="text-sm font-semibold text-destructive">
                {SAVE_ERROR}
              </p>
            ) : null}
            <Button type="submit" className="h-12 rounded-xl" disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
