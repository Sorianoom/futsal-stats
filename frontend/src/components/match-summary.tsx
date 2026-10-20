"use client";

import Link from "next/link";
import { useState } from "react";

import { RedCards } from "@/components/red-cards";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { finalizeMatch } from "@/lib/api/matches";
import type { LoggedEvent, Match } from "@/lib/api/match-types";
import type { Player } from "@/lib/api/types";
import { formatClock } from "@/lib/match/clock";
import { secondsByPlayer, type Stint } from "@/lib/match/lineup";

const CONFLICT = 409;
const LINK = "inline-flex min-h-12 items-center px-3 underline";
const CLOSE_ERROR = "No se pudo cerrar el partido. Inténtalo de nuevo.";

interface MatchSummaryProps {
  match: Match;
  players: readonly Player[];
  /** Tramos de toda la alineación, calculados en local: los minutos se ven sin esperar al servidor. */
  stints: readonly Stint[];
  score: { for: number; against: number };
  /** Rojas efectivas del partido (sin las deshechas). */
  reds: readonly LoggedEvent[];
  /** El servidor ya tiene los tramos de este partido. */
  alreadyClosed: boolean;
  /** Anotaciones que aún no han llegado al servidor. */
  pending: number;
  blocked: boolean;
}

export function MatchSummary({
  match,
  players,
  stints,
  score,
  reds,
  alreadyClosed,
  pending,
  blocked,
}: MatchSummaryProps) {
  const [closed, setClosed] = useState(alreadyClosed);
  const [busy, setBusy] = useState(false);
  const [confirmingRedo, setConfirmingRedo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const names = new Map(players.map((player) => [player.id, player.name]));
  const nameOf = (playerId: string) => names.get(playerId) ?? "Jugador desconocido";
  const seconds = secondsByPlayer(stints);
  const played = Object.entries(seconds)
    .filter(([, total]) => total > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([id, total]) => ({ id, name: nameOf(id), total }));

  async function close(force: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await finalizeMatch(match.id, force);
      setClosed(true);
      setConfirmingRedo(false);
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
              <span className="font-semibold tabular-nums">{formatClock(player.total)}</span>
            </li>
          ))}
        </ul>
      </div>

      {reds.length > 0 ? <RedCards match={match} reds={reds} nameOf={nameOf} /> : null}

      {error ? (
        <p role="alert" className="text-base text-destructive">
          {error}
        </p>
      ) : null}

      {closed ? (
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/estadisticas?id=${match.id}`} className={LINK}>
            Ver estadísticas
          </Link>
          <Link href={`/corregir?id=${match.id}`} className={LINK}>
            Corregir tramos
          </Link>
        </div>
      ) : null}
      {closed && !confirmingRedo ? (
        <Button
          variant="outline"
          size="lg"
          disabled={busy || pending > 0 || blocked}
          onClick={() => setConfirmingRedo(true)}
        >
          Rehacer cierre
        </Button>
      ) : null}
      {closed && confirmingRedo ? (
        <div className="space-y-3 rounded-xl border border-destructive p-4">
          <p>
            Rehacer el cierre borra las correcciones de tramos hechas a mano y los vuelve a calcular
            desde la alineación original.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="lg" onClick={() => setConfirmingRedo(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="lg"
              disabled={busy || pending > 0 || blocked}
              onClick={(event) => {
                // Un doble toque accidental no debe confirmar.
                if (event.detail > 1) return;
                void close(true);
              }}
            >
              Confirmar rehacer cierre
            </Button>
          </div>
        </div>
      ) : null}
      {!closed ? (
        <Button size="lg" disabled={busy || pending > 0 || blocked} onClick={() => void close(false)}>
          Cerrar partido
        </Button>
      ) : null}
      {pending > 0 ? (
        <p className="text-base text-muted-foreground">
          {`Espera a que se envíen las anotaciones (${pending}) para cerrar el partido`}
        </p>
      ) : null}
    </section>
  );
}
