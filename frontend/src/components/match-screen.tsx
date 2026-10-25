"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { MatchBoard, type BoardActivity, type BoardData } from "@/components/match-board";
import { Button } from "@/components/ui/button";
import { ApiError, isUnreachable } from "@/lib/api/client";
import { listLineupEvents, listMatchEvents, listMatches, listStints } from "@/lib/api/matches";
import { getCallup } from "@/lib/api/points";
import { listPlayers } from "@/lib/api/players";
import {
  describeAge,
  loadSnapshot,
  saveSnapshot,
  snapshotGeneration,
  type MatchSnapshot,
} from "@/lib/match/match-cache";
import { EMPTY_OUTBOX, type ConfirmedLog } from "@/lib/match/outbox";
import { loadOutbox } from "@/lib/match/outbox-store";
import { weekStartOf } from "@/lib/weeks";

const LEAVE_WARNING =
  "Hay anotaciones sin enviar. Si sales ahora se perderán. ¿Quieres salir de todos modos?";
const NOT_FOUND = 404;
const UNPROCESSABLE = 422;

/** Lo anotado y sin confirmar en este dispositivo. Si no se puede leer, el partido abre igualmente. */
async function loadSaved(matchId: string): Promise<Pick<BoardData, "savedOutbox" | "storageFailed">> {
  try {
    return { savedOutbox: await loadOutbox(matchId), storageFailed: false };
  } catch {
    return { savedOutbox: EMPTY_OUTBOX, storageFailed: true };
  }
}

async function loadMatch(matchId: string): Promise<BoardData | "not_found"> {
  try {
    const [matches, lineup, events, stints, players, saved] = await Promise.all([
      listMatches(),
      listLineupEvents(matchId),
      listMatchEvents(matchId),
      // Solo sirve para saber si ya estaba cerrado: si falla, el servidor lo dirá al cerrar (409).
      listStints(matchId).catch(() => []),
      listPlayers(),
      loadSaved(matchId),
    ]);
    const match = matches.find((m) => m.id === matchId);
    if (!match) return "not_found";
    // La propuesta de titulares es opcional: sin convocatoria se elige a mano.
    const callup = await getCallup(weekStartOf(match.held_on), matchId).catch(() => null);
    return {
      match,
      lineup,
      events,
      stints,
      players,
      proposed: callup?.starters.guaranteed ?? [],
      ...saved,
    };
  } catch (failure) {
    const unknownMatch =
      failure instanceof ApiError && (failure.status === NOT_FOUND || failure.status === UNPROCESSABLE);
    if (unknownMatch) return "not_found";
    if (isUnreachable(failure)) return fromSnapshot(matchId, failure);
    throw failure;
  }
}

/** Sin red: abre con la última copia del servidor. Sin copia, falla como siempre. */
async function fromSnapshot(matchId: string, failure: unknown): Promise<BoardData> {
  const copy = await loadSnapshot(matchId).catch(() => null);
  if (copy === null) throw failure;
  const { savedAt, ...data } = copy;
  return { ...data, ...(await loadSaved(matchId)), staleSince: savedAt };
}

/** Lo que se guarda de un tablero: sus datos fijos y la vista que el servidor ya confirmó. */
function snapshotOf(data: BoardData, confirmed: ConfirmedLog): Omit<MatchSnapshot, "savedAt"> {
  return {
    match: data.match,
    lineup: [...confirmed.lineup],
    events: [...confirmed.events],
    stints: data.stints,
    players: data.players,
    proposed: data.proposed,
  };
}

function StaleNotice({ savedAt, onRefresh }: { savedAt: number; onRefresh: () => void }) {
  // Se fija al abrir: el texto no cambia solo mientras se mira.
  const [openedAt] = useState(() => Date.now());
  return (
    <div role="status" className="flex items-center justify-between rounded-lg border p-4">
      <p>Sin conexión: datos de hace {describeAge(openedAt - savedAt)}</p>
      <Button variant="outline" onClick={onRefresh}>
        Actualizar
      </Button>
    </div>
  );
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
  // Datos fijos del tablero en pantalla y cola de guardados de la copia local (gana el último).
  const base = useRef<BoardData | null>(null);
  const snapshotWrites = useRef<Promise<void>>(Promise.resolve());

  const storeSnapshot = useCallback(
    (data: BoardData, confirmed: ConfirmedLog): Promise<void> => {
      // Una copia que ya era vieja conserva su fecha: no se hace pasar por reciente.
      const savedAt = data.staleSince;
      // Si se cierra la sesión antes de que le toque a esta escritura, se descarta.
      const requestedAt = snapshotGeneration();
      const write = snapshotWrites.current.then(() =>
        saveSnapshot(matchId, snapshotOf(data, confirmed), savedAt, requestedAt),
      );
      // La cola sigue aunque una escritura falle; quien llama decide qué hacer con el fallo.
      snapshotWrites.current = write.catch(() => undefined);
      return write;
    },
    [matchId],
  );

  // Rechaza si la copia no se guardó: así el registro no da por cubierto lo que aún no lo está.
  const onConfirmed = useCallback(
    async (confirmed: ConfirmedLog) => {
      if (base.current !== null) await storeSnapshot(base.current, confirmed);
    },
    [storeSnapshot],
  );

  useEffect(() => {
    let active = true;
    loadMatch(matchId)
      .then((data) => {
        if (!active) return;
        // Sin red no se sustituye un tablero ya abierto por la copia: se avisa y se deja como está.
        if (data !== "not_found" && data.staleSince !== undefined && hasLoaded.current) {
          setLoadFailed(true);
          return;
        }
        const { revision, force } = requested.current;
        const changedMeanwhile =
          hasLoaded.current &&
          !force &&
          (!activity.current.idle || activity.current.revision !== revision);
        setLoadFailed(false);
        // Datos que llegan tarde no pueden pisar lo que se anotó mientras tanto.
        if (changedMeanwhile) return;
        hasLoaded.current = true;
        if (data === "not_found") {
          base.current = null;
        } else {
          base.current = data;
          // Lo cargado es lo que el servidor tiene: es la copia desde la que abrir sin red.
          // Es un respaldo para abrir sin red: si no se guarda, el partido sigue igual.
          if (data.staleSince === undefined) storeSnapshot(data, data).catch(() => undefined);
        }
        requested.current = { revision: activity.current.revision, force: false };
        setLoaded((previous) => ({ data, version: (previous?.version ?? 0) + 1 }));
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, [matchId, reloadKey, storeSnapshot]);

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
        <h1 className="text-4xl font-extrabold tracking-tight">vs {loaded.data.match.opponent}</h1>
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
      {loaded.data.staleSince !== undefined ? (
        <StaleNotice key={`stale-${loaded.version}`} savedAt={loaded.data.staleSince} onRefresh={refresh} />
      ) : null}
      <MatchBoard
        key={loaded.version}
        matchId={matchId}
        data={loaded.data}
        onReload={reload}
        onRefresh={refresh}
        onActivity={trackActivity}
        onConfirmed={onConfirmed}
      />
    </div>
  );
}
