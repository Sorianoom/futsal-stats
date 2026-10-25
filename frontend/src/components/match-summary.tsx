"use client";

import Link from "next/link";
import { useState } from "react";

import { RedCards } from "@/components/red-cards";
import { ScoreBanner } from "@/components/score-banner";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { finalizeMatch } from "@/lib/api/matches";
import type { LoggedEvent, Match } from "@/lib/api/match-types";
import type { Player } from "@/lib/api/types";
import { formatClock } from "@/lib/match/clock";
import { secondsByPlayer, type Stint } from "@/lib/match/lineup";

const CONFLICT = 409;
const LINK =
  "inline-flex min-h-12 items-center rounded-2xl border-2 bg-card px-5 font-bold [@media(hover:hover)]:hover:bg-muted";
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
  // Ordenados de más a menos: el primero marca el 100 % de las barras.
  const mostMinutes = played[0]?.total ?? 1;

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
      <ScoreBanner
        eyebrow="Final"
        title="Partido terminado"
        note={closed ? "Partido cerrado" : undefined}
        score={score}
      />

      <div className="space-y-3">
        <h3 className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">
          Minutos jugados
        </h3>
        <ul aria-label="Minutos jugados" className="grid gap-2.5 md:grid-cols-2">
          {played.map((player) => (
            <li key={player.id} className="space-y-2 rounded-2xl border bg-card p-3.5">
              <div className="flex items-center justify-between text-lg font-bold">
                <span>{player.name}</span>
                <span className="tabular-nums">{formatClock(player.total)}</span>
              </div>
              <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.round((player.total / mostMinutes) * 100)}%` }}
                />
              </div>
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
        <Button
          size="lg"
          variant="cta"
          className="h-[60px] rounded-2xl text-xl"
          disabled={busy || pending > 0 || blocked}
          onClick={() => void close(false)}
        >
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
