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
import { EVENT_LABEL } from "@/lib/labels";
import type { EventKind } from "@/lib/match/events";

/** Se anotan con un toque, con el último tiempo del marcador. */
const QUICK_KINDS: readonly EventKind[] = ["assist", "shot", "turnover", "steal", "foul", "yellow"];

interface PlayerActionsDialogProps {
  player: Player | null;
  onClose: () => void;
  onQuick: (kind: EventKind) => void;
  onGoal: () => void;
  onRed: () => void;
  onSubstitute: () => void;
}

export function PlayerActionsDialog({
  player,
  onClose,
  onQuick,
  onGoal,
  onRed,
  onSubstitute,
}: PlayerActionsDialogProps) {
  return (
    <Dialog open={player !== null} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{player ? `${player.dorsal} · ${player.name}` : "Jugador"}</DialogTitle>
          <DialogDescription>¿Qué ha pasado?</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <Button size="lg" onClick={onGoal}>
            {EVENT_LABEL.goal}
          </Button>
          {QUICK_KINDS.map((kind) => (
            <Button key={kind} variant="outline" size="lg" onClick={() => onQuick(kind)}>
              {EVENT_LABEL[kind]}
            </Button>
          ))}
          <Button variant="destructive" size="lg" onClick={onRed}>
            {EVENT_LABEL.red}
          </Button>
          <Button variant="secondary" size="lg" onClick={onSubstitute}>
            Cambio
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
