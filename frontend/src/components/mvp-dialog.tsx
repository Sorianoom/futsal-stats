"use client";

import { useState } from "react";

import { PlayerChoice } from "@/components/player-transfer-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { setMatchMvp } from "@/lib/api/matches";
import type { Player } from "@/lib/api/types";

interface MvpDialogProps {
  open: boolean;
  matchId: string;
  /** Jugadores que han jugado el partido. */
  players: Player[];
  current: string | null;
  onSaved: (playerId: string | null) => void;
  onClose: () => void;
}

function Body({ matchId, players, current, onSaved, onClose }: Omit<MvpDialogProps, "open">) {
  const [chosen, setChosen] = useState<string | null>(current);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save(playerId: string | null) {
    setBusy(true);
    setFailed(false);
    try {
      await setMatchMvp(matchId, playerId);
      onSaved(playerId);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">El MVP suma +2 puntos en el Fantasy en esta jornada (si es capitán, ×2).</p>
      {players.length === 0 ? (
        <p className="text-muted-foreground">Aún no ha jugado nadie en este partido.</p>
      ) : (
        <PlayerChoice label="MVP del partido" players={players} value={chosen} onChange={setChosen} />
      )}
      {failed ? (
        <p role="alert" className="text-destructive">
          No se pudo guardar. Comprueba la conexión e inténtalo de nuevo.
        </p>
      ) : null}
      <DialogFooter className="gap-2">
        {current ? (
          <Button type="button" variant="outline" size="lg" disabled={busy} onClick={() => void save(null)}>
            Quitar MVP
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="lg" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" size="lg" disabled={!chosen || busy || chosen === current} onClick={() => void save(chosen)}>
          {busy ? "Guardando…" : "Guardar MVP"}
        </Button>
      </DialogFooter>
    </div>
  );
}

/** Elige el MVP del partido. */
export function MvpDialog({ open, onClose, ...rest }: MvpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>MVP del partido</DialogTitle>
        </DialogHeader>
        {open ? <Body onClose={onClose} {...rest} /> : null}
      </DialogContent>
    </Dialog>
  );
}
