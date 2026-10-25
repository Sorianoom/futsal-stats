"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { ScoreBanner } from "@/components/score-banner";
import { PlayerStatsTable, QuintetStatsTable } from "@/components/stats-tables";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import type { Match } from "@/lib/api/match-types";
import { listMatches } from "@/lib/api/matches";
import { getMatchStats } from "@/lib/api/stats";
import type { MatchStats } from "@/lib/api/stats-types";
import { formatShortDay } from "@/lib/weeks";

const NOT_FOUND = 404;
const CONFLICT = 409;
const BACK_LINK =
  "inline-flex min-h-12 items-center rounded-2xl border-2 bg-card px-5 font-bold [@media(hover:hover)]:hover:bg-muted";

interface Loaded {
  stats: MatchStats;
  match: Match | null;
}

function foulsText(stats: MatchStats): string {
  return stats.team_fouls.map((t) => `${t.fouls} en la ${t.part}ª parte`).join(", ");
}

export function MatchStatsView({ matchId }: { matchId: string }) {
  const { user } = useAuth();
  const [loaded, setLoaded] = useState<Loaded | "not_found" | "incoherent" | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([getMatchStats(matchId), listMatches().catch(() => [] as Match[])])
      .then(([stats, matches]) => {
        if (!active) return;
        setLoaded({ stats, match: matches.find((m) => m.id === matchId) ?? null });
        setFailed(false);
      })
      .catch((failure: unknown) => {
        if (!active) return;
        if (failure instanceof ApiError && failure.status === NOT_FOUND) setLoaded("not_found");
        else if (failure instanceof ApiError && failure.status === CONFLICT) setLoaded("incoherent");
        else setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [matchId, reloadKey]);

  if (failed) {
    return (
      <div role="alert" className="flex items-center justify-between rounded-lg border p-4">
        <p>No se pudieron cargar las estadísticas</p>
        <Button
          variant="outline"
          onClick={() => {
            setFailed(false);
            setReloadKey((key) => key + 1);
          }}
        >
          Reintentar
        </Button>
      </div>
    );
  }
  if (loaded === null) return <p className="text-muted-foreground">Cargando estadísticas…</p>;
  if (loaded === "not_found") {
    return (
      <div className="space-y-4">
        <p className="text-lg">Partido no encontrado</p>
        <Link href="/estadisticas" className={BACK_LINK}>
          Volver a las estadísticas
        </Link>
      </div>
    );
  }

  if (loaded === "incoherent") {
    return (
      <div className="space-y-4">
        <p className="text-lg">Los eventos de este partido no son coherentes</p>
        <p className="text-muted-foreground">
          No se pueden calcular sus estadísticas hasta corregirlos, y mientras tanto no cuenta en el
          acumulado.
        </p>
        <div className="flex flex-wrap gap-2">
          {user?.role === "head_coach" ? (
            <Link href={`/corregir?id=${matchId}`} className={BACK_LINK}>
              Corregir partido
            </Link>
          ) : null}
          <Link href="/estadisticas" className={BACK_LINK}>
            Todas las estadísticas
          </Link>
        </div>
      </div>
    );
  }

  const { stats, match } = loaded;
  const names = new Map(stats.players.map((player) => [player.player_id, player.name]));
  const nameOf = (playerId: string) => names.get(playerId) ?? "Jugador desconocido";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <ScoreBanner
        level={1}
        eyebrow={match ? formatShortDay(match.held_on) : "Estadísticas"}
        title={match ? `vs ${match.opponent}` : "Partido"}
        score={{ for: stats.score.goals_for, against: stats.score.goals_against }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="rounded-2xl bg-card px-4 py-2.5 text-base font-bold">{`Faltas de equipo: ${foulsText(stats)}`}</p>
        <div className="flex flex-wrap items-center gap-2">
          {user?.role === "head_coach" && stats.closed ? (
            <Link href={`/corregir?id=${matchId}`} className={BACK_LINK}>
              Corregir partido
            </Link>
          ) : null}
          <Link href="/estadisticas" className={BACK_LINK}>
            Todas las estadísticas
          </Link>
        </div>
      </div>

      {stats.warnings.map((warning) => (
        <p key={warning} className="rounded-lg border p-3 text-muted-foreground">
          {warning}
        </p>
      ))}

      <section className="space-y-2">
        <h2 className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">Jugadores</h2>
        <PlayerStatsTable players={stats.players} />
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">Quintetos</h2>
        {stats.closed ? (
          <QuintetStatsTable quintets={stats.quintets} nameOf={nameOf} />
        ) : (
          <div className="space-y-2 rounded-xl border p-4">
            <p>Partido sin cerrar: faltan los minutos y los quintetos hasta que se cierre.</p>
            <Link href={`/partido?id=${matchId}`} className={BACK_LINK}>
              Ir al partido
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
