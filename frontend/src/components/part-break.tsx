"use client";

import { ScoreBanner } from "@/components/score-banner";
import { StartersPicker } from "@/components/starters-picker";
import type { Player } from "@/lib/api/types";

interface PartBreakProps {
  /** La parte que va a empezar. */
  part: number;
  score: { for: number; against: number };
  players: readonly Player[];
  capacity: number;
  /** Quiénes estaban en pista al acabar la parte anterior. */
  proposed: readonly string[];
  error: string | null;
  onStart: (starters: string[]) => void;
}

/** Descanso entre partes: marcador y elección de los que salen a pista en la siguiente. */
export function PartBreak({ part, score, players, capacity, proposed, error, onStart }: PartBreakProps) {
  return (
    <section className="space-y-6">
      <ScoreBanner eyebrow="Descanso" title={`Parte ${part - 1} terminada`} score={score} />
      <StartersPicker
        part={part}
        players={players}
        capacity={capacity}
        proposed={proposed}
        busy={false}
        error={error}
        onStart={onStart}
      />
    </section>
  );
}
