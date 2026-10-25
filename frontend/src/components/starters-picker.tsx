"use client";

import { useRef, useState } from "react";

import { CourtSurface } from "@/components/court-surface";
import { Button } from "@/components/ui/button";
import type { Player } from "@/lib/api/types";
import { POSITION_LABEL } from "@/lib/labels";
import { COURT_SLOTS, courtSlots } from "@/lib/match/court-layout";
import { cn } from "@/lib/utils";

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

interface CourtPreviewProps {
  chosen: readonly Player[];
  capacity: number;
  onRemove: (playerId: string) => void;
}

/** Los elegidos sobre la cancha, en su sitio; los huecos que faltan, marcados. Tocar a uno lo quita. */
function CourtPreview({ chosen, capacity, onRemove }: CourtPreviewProps) {
  const placed = courtSlots(chosen);
  const taken = new Set(placed.map(({ x, y }) => `${x},${y}`));
  const missing = COURT_SLOTS.filter(({ x, y }) => !taken.has(`${x},${y}`)).slice(
    0,
    Math.max(capacity - chosen.length, 0),
  );

  return (
    <CourtSurface title="En pista · toca para quitar" className="lg:max-h-[calc(100dvh-16rem)]">
      <ul aria-label="En pista" className="absolute inset-0">
        {placed.map(({ player, x, y }) => {
          const keeper = player.position === "goalkeeper";
          return (
            <li
              key={player.id}
              style={{ left: `${x}%`, top: `${y}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2"
            >
              <button
                type="button"
                aria-label={`Quitar a ${player.name}`}
                onClick={() => onRemove(player.id)}
                className="flex flex-col items-center gap-1.5 rounded-2xl p-1 outline-none focus-visible:ring-4 focus-visible:ring-white/70 active:scale-95"
              >
                <span
                  className={cn(
                    "flex size-16 items-center justify-center rounded-full text-3xl font-extrabold shadow-[0_5px_0_rgba(8,24,80,0.35)] xl:size-[76px]",
                    keeper ? "bg-cta text-cta-foreground" : "bg-white text-primary",
                  )}
                >
                  {player.dorsal}
                </span>
                <span className="rounded-full bg-white px-2.5 py-0.5 text-sm font-extrabold text-foreground">
                  {player.name}
                </span>
              </button>
            </li>
          );
        })}
        {missing.map(({ x, y }) => (
          <li
            key={`${x},${y}`}
            aria-hidden="true"
            style={{ left: `${x}%`, top: `${y}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2"
          >
            <span className="flex size-16 items-center justify-center rounded-full border-[3px] border-dashed border-white/55 text-3xl font-bold text-white/55 xl:size-[76px]">
              +
            </span>
          </li>
        ))}
      </ul>
    </CourtSurface>
  );
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
  const checkboxes = useRef(new Map<string, HTMLInputElement>());
  const complete = selected.size === capacity;
  const chosen = players.filter((player) => selected.has(player.id));

  function toggle(playerId: string) {
    const next = new Set(selected);
    if (!next.delete(playerId)) next.add(playerId);
    setSelected(next);
  }

  // El botón de la pista desaparece al quitar al jugador: el foco pasa a su casilla para no perderse.
  function removeFromCourt(playerId: string) {
    toggle(playerId);
    checkboxes.current.get(playerId)?.focus();
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_28rem]">
      <CourtPreview chosen={chosen} capacity={capacity} onRemove={removeFromCourt} />
      <div className="flex flex-col gap-4">
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="col-span-full pb-2 text-xs font-extrabold tracking-widest text-muted-foreground uppercase">
            Elige los {capacity} que salen a pista
          </legend>
          {players.map((player) => {
            const checked = selected.has(player.id);
            const keeper = player.position === "goalkeeper";
            return (
              <label
                key={player.id}
                className={cn(
                  "flex min-h-12 items-center gap-2.5 rounded-2xl border-2 bg-card px-2.5 text-[15px] font-bold",
                  "has-[:checked]:border-primary has-[:checked]:bg-primary/5",
                  "has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-ring/40",
                  "has-[:disabled]:opacity-50",
                )}
              >
                <input
                  type="checkbox"
                  ref={(element) => {
                    if (element) checkboxes.current.set(player.id, element);
                    else checkboxes.current.delete(player.id);
                  }}
                  aria-label={player.name}
                  className="sr-only"
                  checked={checked}
                  disabled={!checked && selected.size >= capacity}
                  onChange={() => toggle(player.id)}
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold",
                    checked
                      ? keeper
                        ? "bg-cta text-cta-foreground"
                        : "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground",
                  )}
                >
                  {player.dorsal}
                </span>
                <span className="flex-1">
                  <span className="block leading-tight">{player.name}</span>
                  <span className="block text-xs font-medium text-muted-foreground">
                    {POSITION_LABEL[player.position]}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <div className="mt-auto flex flex-col gap-3">
          <p aria-live="polite" className="text-lg font-bold">
            {selected.size} de {capacity} elegidos
          </p>
          {error ? (
            <p role="alert" className="text-base text-destructive">
              {error}
            </p>
          ) : null}
          <Button
            size="lg"
            variant="cta"
            className="h-[60px] rounded-2xl text-xl"
            disabled={!complete || busy}
            onClick={() => onStart([...selected])}
          >
            Empezar {part}ª parte
          </Button>
        </div>
      </div>
    </section>
  );
}
