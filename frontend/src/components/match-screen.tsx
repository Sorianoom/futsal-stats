"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { StartersPicker } from "@/components/starters-picker";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import type { LineupEventRecord, Match } from "@/lib/api/match-types";
import { listLineupEvents, listMatches, syncMatch } from "@/lib/api/matches";
import { getCallup } from "@/lib/api/points";
import { listPlayers } from "@/lib/api/players";
import type { Player } from "@/lib/api/types";
import { LineupError, onCourt, replay, type LineupState } from "@/lib/match/lineup";
import { nextSeq } from "@/lib/match/sequence";
import { weekStartOf } from "@/lib/weeks";

const NOT_FOUND = 404;
const UNPROCESSABLE = 422;
const CONFLICT_REASONS = ["seq_conflict", "id_conflict"];
const OFFLINE_START =
  "Sin conexión. No se pudo empezar la parte; inténtalo de nuevo cuando vuelva la red.";
const START_FAILED = "No se pudo empezar la parte. Inténtalo de nuevo.";
const CHANGED_ELSEWHERE =
  "El partido cambió en otro dispositivo. Se ha recargado; revisa y vuelve a intentarlo.";

interface Loaded {
  match: Match;
  lineup: LineupEventRecord[];
  players: Player[];
  proposed: string[];
}

type Screen = Loaded | "not_found" | null;
type Replayed = { state: LineupState } | { error: string };

function replayLineup(lineup: readonly LineupEventRecord[]): Replayed {
  try {
    return { state: replay(lineup.map((event) => event.payload)) };
  } catch (failure) {
    if (failure instanceof LineupError) return { error: "La alineación guardada no es válida" };
    throw failure;
  }
}

async function loadMatch(matchId: string): Promise<Loaded | "not_found"> {
  try {
    const [matches, lineup, players] = await Promise.all([
      listMatches(),
      listLineupEvents(matchId),
      listPlayers(),
    ]);
    const match = matches.find((m) => m.id === matchId);
    if (!match) return "not_found";
    // La propuesta de titulares es opcional: sin convocatoria se elige a mano.
    const callup = await getCallup(weekStartOf(match.held_on), matchId).catch(() => null);
    return { match, lineup, players, proposed: callup?.starters.guaranteed ?? [] };
  } catch (failure) {
    const unknownMatch =
      failure instanceof ApiError && (failure.status === NOT_FOUND || failure.status === UNPROCESSABLE);
    if (unknownMatch) return "not_found";
    throw failure;
  }
}

function startFailureMessage(failure: unknown): string {
  if (!(failure instanceof ApiError)) return START_FAILED;
  return failure.code === "network" ? OFFLINE_START : failure.message;
}

function sameStarters(event: LineupEventRecord, part: number, starters: readonly string[]): boolean {
  const { payload } = event;
  if (payload.type !== "part_started" || payload.part !== part) return false;
  return [...payload.starters].sort().join() === [...starters].sort().join();
}

function withLineup(screen: Screen, lineup: LineupEventRecord[]): Screen {
  return screen !== null && screen !== "not_found" ? { ...screen, lineup } : screen;
}

interface PlayViewProps {
  players: readonly Player[];
  state: LineupState;
}

function PlayView({ players, state }: PlayViewProps) {
  const onPitch = new Set(onCourt(state));
  const blocked = new Set(state.sentOff);
  const court = players.filter((p) => onPitch.has(p.id));
  const bench = players.filter((p) => !onPitch.has(p.id) && !blocked.has(p.id));
  const title =
    state.currentPart !== null
      ? `Parte ${state.currentPart} en juego`
      : `Parte ${state.lastEndedPart} terminada`;

  return (
    <div className="space-y-6">
      <p className="text-xl font-semibold">{title}</p>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">En pista</h2>
        <ul aria-label="En pista" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {court.map((player) => (
            <li key={player.id} className="rounded-xl border bg-card p-3 text-lg">
              <span className="block font-medium">{player.name}</span>
              <span className="block text-sm text-muted-foreground">{player.dorsal}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Banquillo</h2>
        <ul aria-label="Banquillo" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {bench.map((player) => (
            <li key={player.id} className="rounded-xl border p-3 text-lg">
              <span className="block">{player.name}</span>
              <span className="block text-sm text-muted-foreground">{player.dorsal}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function MatchScreen({ matchId }: { matchId: string }) {
  const [screen, setScreen] = useState<Screen>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // Mismo id y seq al reintentar con los mismos titulares: así un reenvío nunca duplica el evento.
  const attempt = useRef<LineupEventRecord | null>(null);
  // Guard síncrono: el estado de React llega tarde para frenar un doble toque.
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    loadMatch(matchId)
      .then((result) => {
        if (!active) return;
        setScreen(result);
        setLoadFailed(false);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, [matchId, reloadKey]);

  // Safari del iPad descarta y reactiva pestañas: al volver se pide de nuevo el estado real.
  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState === "visible" && !inFlight.current) {
        setReloadKey((key) => key + 1);
      }
    }
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => document.removeEventListener("visibilitychange", refreshWhenVisible);
  }, []);

  const lineup = screen !== null && screen !== "not_found" ? screen.lineup : null;
  const replayed = useMemo(() => (lineup ? replayLineup(lineup) : null), [lineup]);

  function reload() {
    setLoadFailed(false);
    setReloadKey((key) => key + 1);
  }

  async function startPart(starters: string[]) {
    if (inFlight.current) return;
    if (screen === null || screen === "not_found" || replayed === null || "error" in replayed) return;
    inFlight.current = true;
    setStarting(true);
    setStartError(null);
    try {
      const part = replayed.state.lastEndedPart + 1;
      const previous = attempt.current;
      let known = screen.lineup;

      if (previous && !sameStarters(previous, part, starters)) {
        // Tras un corte de red con otros titulares, el primer intento pudo llegar al servidor.
        const fresh = await listLineupEvents(matchId);
        attempt.current = null;
        if (fresh.some((e) => e.id === previous.id)) {
          setScreen((current) => withLineup(current, fresh));
          return;
        }
        known = fresh;
      }

      const event: LineupEventRecord =
        attempt.current ?? {
          id: crypto.randomUUID(),
          seq: nextSeq(known),
          payload: { type: "part_started", part, starters },
        };
      attempt.current = event;

      const result = await syncMatch(matchId, { lineup_events: [event] });
      if (result.accepted.includes(event.id) || result.duplicates.includes(event.id)) {
        attempt.current = null;
        setScreen((current) => withLineup(current, [...known, event]));
        return;
      }
      attempt.current = null;
      const reason = result.rejected.find((r) => r.id === event.id)?.reason ?? "rechazado";
      if (CONFLICT_REASONS.includes(reason)) {
        setStartError(CHANGED_ELSEWHERE);
        reload();
      } else {
        setStartError(`No se pudo empezar la parte: el servidor la rechazó (${reason}).`);
      }
    } catch (failure) {
      setStartError(startFailureMessage(failure));
    } finally {
      inFlight.current = false;
      setStarting(false);
    }
  }

  if (loadFailed) {
    return (
      <div role="alert" className="flex items-center justify-between rounded-lg border p-4">
        <p>No se pudo cargar el partido</p>
        <Button variant="outline" onClick={reload}>
          Reintentar
        </Button>
      </div>
    );
  }
  if (screen === null) return <p className="text-muted-foreground">Cargando partido…</p>;
  if (screen === "not_found") {
    return (
      <div className="space-y-4">
        <p className="text-lg">Partido no encontrado</p>
        <Link href="/partido" className="inline-flex min-h-12 items-center px-3 underline">
          Volver a los partidos
        </Link>
      </div>
    );
  }

  const { match, players, proposed } = screen;
  const inSetup =
    replayed !== null && "state" in replayed && replayed.state.currentPart === null &&
    replayed.state.lastEndedPart === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">vs {match.opponent}</h1>
        <Link href="/partido" className="inline-flex min-h-12 items-center px-3 underline">
          Todos los partidos
        </Link>
      </header>

      {replayed && "error" in replayed ? (
        <div role="alert" className="flex items-center justify-between rounded-lg border p-4">
          <p className="text-destructive">{replayed.error}</p>
          <Button variant="outline" onClick={reload}>
            Recargar
          </Button>
        </div>
      ) : null}

      {inSetup ? (
        <StartersPicker
          part={1}
          players={players}
          capacity={5}
          proposed={proposed}
          busy={starting}
          error={startError}
          onStart={(starters) => void startPart(starters)}
        />
      ) : null}

      {replayed && "state" in replayed && !inSetup ? (
        <PlayView players={players} state={replayed.state} />
      ) : null}
    </div>
  );
}
