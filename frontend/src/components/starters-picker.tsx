"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { Player } from "@/lib/api/types";
import { POSITION_LABEL } from "@/lib/labels";

interface StartersPickerProps {
  part: number;
  players: readonly Player[];
  /** Cuántos tienen que salir a pista (5, o menos si hay expulsados). */
  capacity: number;
  proposed: readonly string[];
  busy: boolean;
  error: string | null;
  onStart: (starters: string[]) => void;
}

export function StartersPicker({
  part,
  players,
  capacity,
  proposed,
  busy,
  error,
  onStart,
}: StartersPickerProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(players.filter((p) => proposed.includes(p.id)).map((p) => p.id)),
  );
  const complete = selected.size === capacity;

  function toggle(playerId: string) {
    const next = new Set(selected);
    if (!next.delete(playerId)) next.add(playerId);
    setSelected(next);
  }

  return (
    <section className="space-y-4">
      <fieldset className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <legend className="pb-2 text-lg font-medium">Elige los {capacity} que salen a pista</legend>
        {players.map((player) => {
          const checked = selected.has(player.id);
          return (
            <label
              key={player.id}
              className="flex min-h-16 items-center gap-3 rounded-xl border bg-card p-3 text-lg has-[:checked]:border-primary has-[:checked]:bg-muted"
            >
              <input
                type="checkbox"
                aria-label={player.name}
                className="size-6"
                checked={checked}
                disabled={!checked && selected.size >= capacity}
                onChange={() => toggle(player.id)}
              />
              <span className="flex-1">
                <span className="block">{player.name}</span>
                <span className="block text-sm text-muted-foreground">
                  {player.dorsal} · {POSITION_LABEL[player.position]}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <p aria-live="polite" className="text-lg">
        {selected.size} de {capacity} elegidos
      </p>
      {error ? (
        <p role="alert" className="text-base text-destructive">
          {error}
        </p>
      ) : null}
      <Button size="lg" disabled={!complete || busy} onClick={() => onStart([...selected])}>
        Empezar {part}ª parte
      </Button>
    </section>
  );
}
