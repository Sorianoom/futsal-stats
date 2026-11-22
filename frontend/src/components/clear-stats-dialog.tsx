"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { clearMatchStats } from "@/lib/api/matches";
import { forgetMatchClock } from "@/lib/match/stopwatch";

interface ClearStatsDialogProps {
  open: boolean;
  matchId: string;
  opponent: string;
  /** Anotaciones aún sin enviar: se volverían a mandar tras borrar. */
  pending: number;
  onDone: () => void;
  onClose: () => void;
}

function Body({ matchId, opponent, pending, onDone, onClose }: Omit<ClearStatsDialogProps, "open">) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function confirm() {
    setBusy(true);
    setFailed(false);
    try {
      await clearMatchStats(matchId);
      forgetMatchClock(matchId);
      onDone();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p>
        {`Se borra todo lo anotado del partido contra ${opponent}: alineaciones, minutos, goles, faltas, tarjetas y valoraciones. El partido queda como sin empezar.`}
      </p>
      <p className="font-semibold text-destructive">No se puede deshacer.</p>
      {pending > 0 ? (
        <p role="alert" className="rounded-xl border border-destructive/40 p-3 font-semibold text-destructive">
          {`Hay ${pending} anotaciones sin enviar. Espera a que se envíen y vuelve a abrir esto.`}
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className="text-destructive">
          No se pudieron borrar. Comprueba la conexión e inténtalo de nuevo.
        </p>
      ) : null}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" size="lg" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" variant="destructive" size="lg" disabled={busy || pending > 0} onClick={() => void confirm()}>
          {busy ? "Borrando…" : "Borrar estadísticas"}
        </Button>
      </DialogFooter>
    </div>
  );
}

/** Confirmación para borrar todas las estadísticas de un partido mal tomado. */
export function ClearStatsDialog({ open, onClose, ...rest }: ClearStatsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Borrar las estadísticas del partido?</DialogTitle>
        </DialogHeader>
        {open ? <Body onClose={onClose} {...rest} /> : null}
      </DialogContent>
    </Dialog>
  );
}
