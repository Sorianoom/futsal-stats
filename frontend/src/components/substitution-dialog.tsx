"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Player } from "@/lib/api/types";

export interface SubstitutionAnchor {
  player: Player;
  /** De dónde se parte: de un jugador de la pista (elige quién entra) o del banquillo (quién sale). */
  side: "court" | "bench";
}

interface SubstitutionDialogProps {
  anchor: SubstitutionAnchor | null;
  candidates: readonly Player[];
  onPick: (player: Player) => void;
  onClose: () => void;
  /** Abre la pantalla de varios cambios a la vez, partiendo de este jugador. */
  onMany?: () => void;
}

export function SubstitutionDialog({ anchor, candidates, onPick, onClose, onMany }: SubstitutionDialogProps) {
  const title = anchor
    ? anchor.side === "court"
      ? `¿Quién entra por ${anchor.player.name}?`
      : `¿Quién sale por ${anchor.player.name}?`
    : "Cambio";

  return (
    <Dialog open={anchor !== null} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Se anota con el tiempo del reloj</DialogDescription>
        </DialogHeader>
        {candidates.length === 0 ? (
          <p className="text-muted-foreground">No hay jugadores disponibles</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {candidates.map((player) => (
              <Button key={player.id} variant="outline" size="lg" onClick={() => onPick(player)}>
                {player.dorsal} · {player.name}
              </Button>
            ))}
          </div>
        )}
        {onMany ? (
          <Button variant="secondary" size="lg" className="h-14 w-full text-lg" onClick={onMany}>
            Varios cambios a la vez
          </Button>
        ) : null}
        <Button variant="ghost" className="w-full" onClick={onClose}>
          Cancelar
        </Button>
      </DialogContent>
    </Dialog>
  );
}
