"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { MatchBoard, type BoardActivity, type BoardData } from "@/components/match-board";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { listLineupEvents, listMatchEvents, listMatches } from "@/lib/api/matches";
import { getCallup } from "@/lib/api/points";
import { listPlayers } from "@/lib/api/players";
import { weekStartOf } from "@/lib/weeks";

const LEAVE_WARNING =
  "Hay anotaciones sin enviar. Si sales ahora se perderán. ¿Quieres salir de todos modos?";
const NOT_FOUND = 404;
const UNPROCESSABLE = 422;

async function loadMatch(matchId: string): Promise<BoardData | "not_found"> {
  try {
    const [matches, lineup, events, players] = await Promise.all([
      listMatches(),
      listLineupEvents(matchId),
      listMatchEvents(matchId),
      listPlayers(),
    ]);
    const match = matches.find((m) => m.id === matchId);
    if (!match) return "not_found";
    // La propuesta de titulares es opcional: sin convocatoria se elige a mano.
    const callup = await getCallup(weekStartOf(match.held_on), matchId).catch(() => null);
    return { match, lineup, events, players, proposed: callup?.starters.guaranteed ?? [] };
  } catch (failure) {
    const unknownMatch =
      failure instanceof ApiError && (failure.status === NOT_FOUND || failure.status === UNPROCESSABLE);
    if (unknownMatch) return "not_found";
    throw failure;
  }
}

interface Loaded {
  data: BoardData | "not_found";
  /** Sube con cada carga: un tablero nuevo parte de lo que dice el servidor. */
  version: number;
}

export function MatchScreen({ matchId }: { matchId: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Lo que el tablero comunica: si tiene algo a medias o sin enviar, y cuántas anotaciones lleva.
  const activity = useRef<BoardActivity>({ idle: true, revision: 0, pending: 0 });
  // Desde qué estado del tablero se pidió la carga, y si hay que aplicarla pase lo que pase.
  const requested = useRef({ revision: 0, force: false });
  const hasLoaded = useRef(false);

  useEffect(() => {
    let active = true;
    loadMatch(matchId)
      .then((data) => {
        if (!active) return;
        const { revision, force } = requested.current;
        const changedMeanwhile =
          hasLoaded.current &&
          !force &&
          (!activity.current.idle || activity.current.revision !== revision);
        setLoadFailed(false);
        // Datos que llegan tarde no pueden pisar lo que se anotó mientras tanto.
        if (changedMeanwhile) return;
        hasLoaded.current = true;
        requested.current = { revision: activity.current.revision, force: false };
        setLoaded((previous) => ({ data, version: (previous?.version ?? 0) + 1 }));
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, [matchId, reloadKey]);

  const request = useCallback((force: boolean) => {
    requested.current = { revision: activity.current.revision, force };
    setLoadFailed(false);
    setReloadKey((key) => key + 1);
  }, []);
  const reload = useCallback(() => request(true), [request]);
  const refresh = useCallback(() => request(false), [request]);
  const trackActivity = useCallback((next: BoardActivity) => {
    activity.current = next;
  }, []);

  if (loadFailed && loaded === null) {
    return (
      <div role="alert" className="flex items-center justify-between rounded-lg border p-4">
        <p>No se pudo cargar el partido</p>
        <Button variant="outline" onClick={reload}>
          Reintentar
        </Button>
      </div>
    );
  }
  if (loaded === null) return <p className="text-muted-foreground">Cargando partido…</p>;
  if (loaded.data === "not_found") {
    return (
      <div className="space-y-4">
        <p className="text-lg">Partido no encontrado</p>
        <Link href="/partido" className="inline-flex min-h-12 items-center px-3 underline">
          Volver a los partidos
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">vs {loaded.data.match.opponent}</h1>
        <Link
          href="/partido"
          className="inline-flex min-h-12 items-center px-3 underline"
          onClick={(event) => {
            if (activity.current.pending > 0 && !window.confirm(LEAVE_WARNING)) event.preventDefault();
          }}
        >
          Todos los partidos
        </Link>
      </header>
      {loadFailed ? (
        <div role="alert" className="flex items-center justify-between rounded-lg border p-4">
          <p>No se pudo actualizar el partido</p>
          <Button variant="outline" onClick={reload}>
            Reintentar
          </Button>
        </div>
      ) : null}
      <MatchBoard
        key={loaded.version}
        matchId={matchId}
        data={loaded.data}
        onReload={reload}
        onRefresh={refresh}
        onActivity={trackActivity}
      />
    </div>
  );
}
