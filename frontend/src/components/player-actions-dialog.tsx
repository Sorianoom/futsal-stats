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
import { shortName } from "@/lib/player-name";

/** Se anotan con un toque, con el último tiempo del marcador. */
const QUICK_KINDS: readonly EventKind[] = ["assist", "shot", "turnover", "steal", "key_action", "foul", "yellow"];
/** Solo el portero para: a los de campo no se les ofrece. */
const KEEPER_KINDS: readonly EventKind[] = ["save", ...QUICK_KINDS];

function quickKindsFor(player: Player | null): readonly EventKind[] {
  return player?.position === "goalkeeper" ? KEEPER_KINDS : QUICK_KINDS;
}

interface PlayerActionsDialogProps {
  player: Player | null;
  /** Los del banquillo: se ofrecen para cambiar al jugador con un solo toque. */
  bench: readonly Player[];
  onSubstituteWith: (candidate: Player) => void;
  onClose: () => void;
  onQuick: (kind: EventKind) => void;
  onGoal: () => void;
  onRed: () => void;
  onSubstitute: () => void;
}

export function PlayerActionsDialog({
  player,
  bench,
  onSubstituteWith,
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
          {quickKindsFor(player).map((kind) => (
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
        {bench.length > 0 ? (
          <div role="group" aria-label="Cambiar por" className="space-y-2">
            <p aria-hidden="true" className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">
              Cambiar por
            </p>
            <div className="grid grid-cols-2 gap-2">
              {bench.map((candidate) => (
                <Button
                  key={candidate.id}
                  variant="outline"
                  className="h-12 justify-start gap-3 rounded-2xl px-3 text-[15px] font-bold"
                  onClick={() => onSubstituteWith(candidate)}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-extrabold text-secondary-foreground">
                    {candidate.dorsal}
                  </span>
                  <span className="truncate">{shortName(candidate)}</span>
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
