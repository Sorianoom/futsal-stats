"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { finalizeMatch } from "@/lib/api/matches";
import type { Player } from "@/lib/api/types";
import { formatClock } from "@/lib/match/clock";
import { secondsByPlayer, type Stint } from "@/lib/match/lineup";

const CONFLICT = 409;
const CLOSE_ERROR = "No se pudo cerrar el partido. Inténtalo de nuevo.";

interface MatchSummaryProps {
  matchId: string;
  players: readonly Player[];
  /** Tramos de toda la alineación, calculados en local: los minutos se ven sin esperar al servidor. */
  stints: readonly Stint[];
  score: { for: number; against: number };
  /** El servidor ya tiene los tramos de este partido. */
  alreadyClosed: boolean;
  /** Anotaciones que aún no han llegado al servidor. */
  pending: number;
  blocked: boolean;
}

export function MatchSummary({
  matchId,
  players,
  stints,
  score,
  alreadyClosed,
  pending,
  blocked,
}: MatchSummaryProps) {
  const [closed, setClosed] = useState(alreadyClosed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seconds = secondsByPlayer(stints);
  const played = players
    .filter((player) => (seconds[player.id] ?? 0) > 0)
    .sort((a, b) => (seconds[b.id] ?? 0) - (seconds[a.id] ?? 0));

  async function close(force: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await finalizeMatch(matchId, force);
      setClosed(true);
    } catch (failure) {
      // Que ya estuviera cerrado es el resultado buscado: se pasa a ofrecer rehacer el cierre.
      if (failure instanceof ApiError && failure.status === CONFLICT && !force) setClosed(true);
      else setError(CLOSE_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Partido terminado</h2>
          {closed ? <p className="text-lg font-medium text-muted-foreground">Partido cerrado</p> : null}
        </div>
        <p aria-label="Marcador" className="text-5xl font-bold tabular-nums">
          {score.for} – {score.against}
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Minutos jugados</h3>
        <ul aria-label="Minutos jugados" className="grid gap-2 md:grid-cols-2">
          {played.map((player) => (
            <li
              key={player.id}
              className="flex items-center justify-between rounded-xl border bg-card p-3 text-lg"
            >
              <span>{player.name}</span>
              <span className="font-semibold tabular-nums">{formatClock(seconds[player.id] ?? 0)}</span>
            </li>
          ))}
        </ul>
      </div>

      {error ? (
        <p role="alert" className="text-base text-destructive">
          {error}
        </p>
      ) : null}

      {closed ? (
        <Button variant="outline" size="lg" disabled={busy || pending > 0 || blocked} onClick={() => void close(true)}>
          Rehacer cierre
        </Button>
      ) : (
        <div className="space-y-2">
          <Button size="lg" disabled={busy || pending > 0 || blocked} onClick={() => void close(false)}>
            Cerrar partido
          </Button>
          {pending > 0 ? (
            <p className="text-base text-muted-foreground">
              {`Espera a que se envíen las anotaciones (${pending}) para cerrar el partido`}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
