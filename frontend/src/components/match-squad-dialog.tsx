"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Player } from "@/lib/api/types";
import { cn } from "@/lib/utils";

interface MatchSquadDialogProps {
  open: boolean;
  players: Player[];
  /** Convocados al abrir. */
  selected: readonly string[];
  /** Ya salieron al campo: no se pueden quitar. */
  locked: ReadonlySet<string>;
  onSave: (playerIds: string[]) => void;
  onClose: () => void;
}

function Body({ players, selected, locked, onSave, onClose }: Omit<MatchSquadDialogProps, "open">) {
  const [chosen, setChosen] = useState(() => new Set([...selected, ...locked]));

  function toggle(id: string) {
    if (locked.has(id)) return;
    setChosen((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <p className="text-muted-foreground">
        Marca quién está convocado hoy. Solo ellos salen en el banquillo. Los que ya han jugado no se pueden quitar.
      </p>
      <ul aria-label="Jugadores" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {players.map((player) => {
          const on = chosen.has(player.id);
          return (
            <li key={player.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-disabled={locked.has(player.id) || undefined}
                onClick={() => toggle(player.id)}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 text-left text-base focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  on ? "border-primary bg-primary/10 font-bold" : "text-muted-foreground",
                )}
              >
                <span className="w-8 text-right tabular-nums">{player.dorsal}</span>
                <span className="min-w-0 flex-1 truncate">{player.name}</span>
                {player.status !== "available" ? <span className="text-sm">Lesionado</span> : null}
                <span aria-hidden="true" className="text-lg">
                  {on ? "✓" : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" size="lg" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" size="lg" onClick={() => onSave(players.filter((p) => chosen.has(p.id)).map((p) => p.id))}>
          {`Confirmar (${chosen.size})`}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Convocatoria del partido: quién puede salir al campo hoy. */
export function MatchSquadDialog({ open, onClose, ...rest }: MatchSquadDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Convocatoria del partido</DialogTitle>
        </DialogHeader>
        {open ? <Body onClose={onClose} {...rest} /> : null}
      </DialogContent>
    </Dialog>
  );
}
