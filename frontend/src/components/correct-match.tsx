"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { CorrectEvents } from "@/components/correct-events";
import { StintDialog, type StintTarget } from "@/components/stint-dialog";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import type { Match, StintRecord } from "@/lib/api/match-types";
import { listMatches, listStints } from "@/lib/api/matches";
import { listPlayers } from "@/lib/api/players";
import { deleteStint } from "@/lib/api/stints";
import type { Player } from "@/lib/api/types";
import {
  elapsedToDisplay,
  formatClock,
  loadClockSettings,
  type ClockSettings,
} from "@/lib/match/clock";

const NOT_FOUND = 404;
const DELETE_ERROR = "No se pudo borrar el tramo. Inténtalo de nuevo.";
const LINK = "inline-flex min-h-12 items-center px-3 underline";
const PARTS = [1, 2] as const;

interface Loaded {
  match: Match | null;
  stints: StintRecord[];
  players: Player[];
}

async function load(matchId: string): Promise<Loaded | "not_found"> {
  try {
    const [stints, matches, players] = await Promise.all([
      listStints(matchId),
      listMatches().catch(() => [] as Match[]),
      listPlayers(true).catch(() => [] as Player[]),
    ]);
    return { stints, match: matches.find((m) => m.id === matchId) ?? null, players };
  } catch (failure) {
    if (failure instanceof ApiError && failure.status === NOT_FOUND) return "not_found";
    throw failure;
  }
}

interface RowProps {
  stint: StintRecord;
  name: string;
  range: string;
  confirming: boolean;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

function StintRow({
  stint,
  name,
  range,
  confirming,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: RowProps) {
  return (
    <li key={stint.id} className="flex items-center gap-4 rounded-xl border bg-card p-4">
      <span className="flex-1">
        <span className="block text-lg font-medium">{name}</span>
        <span className="block text-muted-foreground">{range}</span>
      </span>
      {confirming ? (
        <span className="flex gap-2">
          <Button variant="outline" onClick={onCancelDelete}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={(event) => {
              // Un doble toque accidental no debe confirmar el borrado.
              if (event.detail > 1) return;
              onConfirmDelete();
            }}
          >
            Confirmar borrar
          </Button>
        </span>
      ) : (
        <span className="flex gap-2">
          <Button variant="outline" aria-label={`Editar tramo de ${name} ${range}`} onClick={onEdit}>
            Editar
          </Button>
          <Button variant="outline" aria-label={`Borrar tramo de ${name} ${range}`} onClick={onAskDelete}>
            Borrar
          </Button>
        </span>
      )}
    </li>
  );
}

export function CorrectMatch({ matchId }: { matchId: string }) {
  const { user } = useAuth();
  const isHeadCoach = user?.role === "head_coach";
  const [loaded, setLoaded] = useState<Loaded | "not_found" | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [settings] = useState<ClockSettings>(() => loadClockSettings());
  const [target, setTarget] = useState<StintTarget | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deleteFailed, setDeleteFailed] = useState(false);

  useEffect(() => {
    if (!isHeadCoach) return;
    let active = true;
    load(matchId)
      .then((result) => {
        if (!active) return;
        setLoaded(result);
        setFailed(false);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [matchId, reloadKey, isHeadCoach]);

  const reload = useCallback(() => {
    setFailed(false);
    setReloadKey((key) => key + 1);
  }, []);

  async function remove(stintId: string) {
    setDeleteFailed(false);
    try {
      await deleteStint(stintId);
    } catch (failure) {
      // Si ya no existía el resultado es el buscado: solo se refresca la lista.
      if (!(failure instanceof ApiError && failure.status === NOT_FOUND)) {
        setDeleteFailed(true);
        setConfirmingId(null);
        return;
      }
    }
    setConfirmingId(null);
    reload();
  }

  if (!isHeadCoach) {
    return <p className="text-lg">Solo el entrenador puede corregir partidos</p>;
  }
  if (failed) {
    return (
      <div role="alert" className="flex items-center justify-between rounded-lg border p-4">
        <p>No se pudieron cargar los tramos</p>
        <Button variant="outline" onClick={reload}>
          Reintentar
        </Button>
      </div>
    );
  }
  if (loaded === null) return <p className="text-muted-foreground">Cargando tramos…</p>;
  if (loaded === "not_found") {
    return (
      <div className="space-y-4">
        <p className="text-lg">Partido no encontrado</p>
        <Link href="/estadisticas" className={LINK}>
          Ir a las estadísticas
        </Link>
      </div>
    );
  }

  const { match, stints, players } = loaded;
  const names = new Map(players.map((player) => [player.id, player.name]));
  const nameOf = (playerId: string) => names.get(playerId) ?? "Jugador desconocido";
  const shown = (elapsed: number) => formatClock(elapsedToDisplay(elapsed, settings));
  const ordered = [...stints].sort((a, b) => a.part - b.part || a.start_s - b.start_s);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">{match ? `Corregir vs ${match.opponent}` : "Corregir partido"}</h1>
        <Link href={`/estadisticas?id=${matchId}`} className={LINK}>
          Ver estadísticas
        </Link>
      </header>

      <p className="rounded-lg border p-3 text-muted-foreground">
        Rehacer el cierre del partido borra estas correcciones y vuelve a calcular los tramos desde la
        alineación original. Las horas se muestran como las vería el marcador.
      </p>

      {deleteFailed ? (
        <p role="alert" className="text-base text-destructive">
          {DELETE_ERROR}
        </p>
      ) : null}

      {stints.length === 0 ? (
        <div className="space-y-2">
          <p className="text-lg">Este partido no tiene tramos que corregir: ciérralo primero.</p>
          <Link href={`/partido?id=${matchId}`} className={LINK}>
            Ir al partido
          </Link>
        </div>
      ) : (
        PARTS.map((part) => {
          const inPart = ordered.filter((s) => s.part === part);
          if (inPart.length === 0) return null;
          return (
            <section key={part} className="space-y-2">
              <h2 className="text-xl font-semibold">{`Parte ${part}`}</h2>
              <ul aria-label={`Tramos de la parte ${part}`} className="space-y-3">
                {inPart.map((stint) => (
                  <StintRow
                    key={stint.id}
                    stint={stint}
                    name={nameOf(stint.player_id)}
                    range={`de ${shown(stint.start_s)} a ${shown(stint.end_s)}`}
                    confirming={confirmingId === stint.id}
                    onEdit={() => setTarget({ kind: "edit", stint })}
                    onAskDelete={() => setConfirmingId(stint.id)}
                    onCancelDelete={() => setConfirmingId(null)}
                    onConfirmDelete={() => void remove(stint.id)}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}

      <Button size="lg" onClick={() => setTarget({ kind: "add" })}>
        Añadir tramo
      </Button>

      <CorrectEvents matchId={matchId} nameOf={nameOf} settings={settings} />

      <StintDialog
        matchId={matchId}
        target={target}
        players={players}
        settings={settings}
        onClose={() => setTarget(null)}
        onSaved={() => {
          setTarget(null);
          reload();
        }}
      />
    </div>
  );
}
