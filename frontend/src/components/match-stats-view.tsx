"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useAuth } from "@/components/auth-provider";
import { MatchOfficialToggle } from "@/components/match-official-toggle";
import { ScoreBanner } from "@/components/score-banner";
import { PlayerStatsTable, QuintetStatsTable } from "@/components/stats-tables";
import { Button } from "@/components/ui/button";
import type { MatchStats } from "@/lib/api/stats-types";
import { matchesQuery, matchStatsQuery } from "@/lib/queries";
import { useApiQuery } from "@/lib/use-api-query";
import { formatShortDay } from "@/lib/weeks";

const BACK_LINK =
  "inline-flex min-h-12 items-center rounded-2xl border-2 bg-card px-5 font-bold [@media(hover:hover)]:hover:bg-muted";

function foulsText(stats: MatchStats): string {
  return stats.team_fouls.map((t) => `${t.fouls} en la ${t.part}ª parte`).join(", ");
}

function UnclosedNote({ children }: { children: ReactNode }) {
  return <div className="space-y-2 rounded-xl border p-4">{children}</div>;
}

/** Al jugador no se le habla de quintetos: solo se le dice que faltan los minutos. */
function PlayerUnclosedNote({ closed }: { closed: boolean }) {
  if (closed) return null;
  return (
    <UnclosedNote>
      <p>Partido sin cerrar: faltan los minutos hasta que se cierre.</p>
    </UnclosedNote>
  );
}

interface QuintetSectionProps {
  matchId: string;
  closed: boolean;
  quintets: MatchStats["quintets"];
  nameOf: (playerId: string) => string;
}

function QuintetSection({ matchId, closed, quintets, nameOf }: QuintetSectionProps) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">Quintetos</h2>
      {closed ? (
        <QuintetStatsTable quintets={quintets} nameOf={nameOf} />
      ) : (
        <UnclosedNote>
          <p>Partido sin cerrar: faltan los minutos y los quintetos hasta que se cierre.</p>
          <Link href={`/partido?id=${matchId}`} className={BACK_LINK}>
            Ir al partido
          </Link>
        </UnclosedNote>
      )}
    </section>
  );
}

export function MatchStatsView({ matchId }: { matchId: string }) {
  const { user } = useAuth();
  const statsRequest = matchStatsQuery(matchId);
  const { data: result, failed, reload } = useApiQuery(statsRequest.key, statsRequest.fetch);
  // El rival y la fecha salen de la lista de partidos; si no llega, se enseña el detalle sin ellos.
  const {
    data: matches,
    failed: matchesFailed,
    reload: reloadMatches,
  } = useApiQuery(matchesQuery.key, matchesQuery.fetch);

  const alert = failed ? (
    <div role="alert" className="flex items-center justify-between rounded-lg border p-4">
      <p>No se pudieron cargar las estadísticas</p>
      <Button variant="outline" onClick={reload}>
        Reintentar
      </Button>
    </div>
  ) : null;

  if (result === null || (result.status === "ok" && matches === null && !matchesFailed)) {
    return alert ?? <p className="text-muted-foreground">Cargando estadísticas…</p>;
  }
  if (result.status === "not_found") {
    return (
      <div className="space-y-4">
        {alert}
        <p className="text-lg">Partido no encontrado</p>
        <Link href="/estadisticas" className={BACK_LINK}>
          Volver a las estadísticas
        </Link>
      </div>
    );
  }

  if (result.status === "incoherent") {
    return (
      <div className="space-y-4">
        {alert}
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

  const { stats } = result;
  // Las valoraciones de quintetos y los avisos son del cuerpo técnico; al jugador no le llegan.
  const isPlayer = user?.role === "player";
  const match = matches?.find((m) => m.id === matchId) ?? null;
  const names = new Map(stats.players.map((player) => [player.player_id, player.name]));
  const nameOf = (playerId: string) => names.get(playerId) ?? "Jugador desconocido";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {alert}
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

      {match ? (
        <MatchOfficialToggle
          matchId={matchId}
          isOfficial={match.is_official !== false}
          canChange={!isPlayer}
          onChanged={reloadMatches}
        />
      ) : null}

      {isPlayer
        ? null
        : stats.warnings.map((warning) => (
            <p key={warning} className="rounded-lg border p-3 text-muted-foreground">
              {warning}
            </p>
          ))}

      <section className="space-y-2">
        <h2 className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">Jugadores</h2>
        <PlayerStatsTable players={stats.players} />
      </section>

      {isPlayer ? (
        <PlayerUnclosedNote closed={stats.closed} />
      ) : (
        <QuintetSection matchId={matchId} closed={stats.closed} quintets={stats.quintets} nameOf={nameOf} />
      )}
    </div>
  );
}
