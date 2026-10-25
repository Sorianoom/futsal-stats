"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { AttendanceDialog } from "@/components/attendance-dialog";
import { SessionFormDialog } from "@/components/session-form-dialog";
import { Button } from "@/components/ui/button";
import { WeekNavigator } from "@/components/week-navigator";
import { WinsDialog } from "@/components/wins-dialog";
import { listSessions } from "@/lib/api/points";
import { listPlayers } from "@/lib/api/players";
import type { Player, TeamSession } from "@/lib/api/types";
import { SESSION_KIND_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import {
  currentWeekStart,
  formatShortDay,
  formatWeekdayShort,
  todayInMadrid,
  weekDays,
  weekStartOf,
} from "@/lib/weeks";

interface LoadedSessions {
  week: string;
  items: TeamSession[];
}

export default function EntrenosPage() {
  const { user } = useAuth();
  const isHeadCoach = user?.role === "head_coach";
  const [week, setWeek] = useState(() => currentWeekStart());
  const [today] = useState(() => todayInMadrid());
  // null hasta que llega la plantilla: sin ella no se puede pasar lista ni dar victorias.
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [loadedSessions, setLoadedSessions] = useState<LoadedSessions | null>(null);
  const [sessionsFailed, setSessionsFailed] = useState(false);
  const [playersFailed, setPlayersFailed] = useState(false);
  const [sessionsKey, setSessionsKey] = useState(0);
  const [playersKey, setPlayersKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [attendanceOf, setAttendanceOf] = useState<TeamSession | null>(null);
  const [winsOf, setWinsOf] = useState<TeamSession | null>(null);

  // Solo se muestran las sesiones de la semana visible: nunca las de otra.
  const sessions = loadedSessions?.week === week ? loadedSessions.items : null;

  useEffect(() => {
    if (!isHeadCoach) return;
    let active = true;
    listPlayers()
      .then((list) => {
        if (!active) return;
        setPlayers(list);
        setPlayersFailed(false);
      })
      .catch(() => {
        if (active) setPlayersFailed(true);
      });
    return () => {
      active = false;
    };
  }, [isHeadCoach, playersKey]);

  useEffect(() => {
    if (!isHeadCoach) return;
    let active = true;
    listSessions(week)
      .then((items) => {
        if (!active) return;
        setLoadedSessions({ week, items });
        setSessionsFailed(false);
      })
      .catch(() => {
        if (active) setSessionsFailed(true);
      });
    return () => {
      active = false;
    };
  }, [week, sessionsKey, isHeadCoach]);

  function retrySessions() {
    setSessionsFailed(false);
    setSessionsKey((key) => key + 1);
  }

  function retryPlayers() {
    setPlayersFailed(false);
    setPlayersKey((key) => key + 1);
  }

  if (!isHeadCoach) {
    return <p className="text-lg">Solo el entrenador puede gestionar los entrenos</p>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-extrabold tracking-tight">Entrenos</h1>
        <WeekNavigator
          week={week}
          onChange={(next) => {
            setWeek(next);
            setSessionsFailed(false);
          }}
        />
      </header>

      <Button variant="cta" size="lg" className="rounded-2xl" onClick={() => setCreating(true)}>
        Nueva sesión
      </Button>

      {sessions ? (
        <ol aria-label="Días de la semana" className="grid grid-cols-7 gap-2">
          {weekDays(week).map((day) => {
            const isToday = day === today;
            const hasSession = sessions.some((session) => session.held_on === day);
            return (
              <li
                key={day}
                aria-current={isToday ? "date" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-2xl border-2 py-3",
                  isToday ? "border-primary bg-primary text-primary-foreground" : "bg-card",
                )}
              >
                <span
                  className={cn(
                    "text-xs font-extrabold tracking-widest uppercase",
                    isToday ? "text-primary-foreground/90" : "text-muted-foreground",
                  )}
                >
                  {formatWeekdayShort(day)}
                </span>
                <span className="text-2xl font-extrabold tabular-nums">{Number(day.slice(-2))}</span>
                {hasSession ? <span className="sr-only">Con sesión</span> : null}
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-1 size-2 rounded-full",
                    hasSession ? (isToday ? "bg-cta" : "bg-primary") : "bg-transparent",
                  )}
                />
              </li>
            );
          })}
        </ol>
      ) : null}

      {sessionsFailed ? (
        <div role="alert" className="flex items-center justify-between rounded-lg border p-4">
          <p>No se pudieron cargar las sesiones</p>
          <Button variant="outline" onClick={retrySessions}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {playersFailed ? (
        <div role="alert" className="flex items-center justify-between rounded-lg border p-4">
          <p>No se pudo cargar la plantilla</p>
          <Button variant="outline" onClick={retryPlayers}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {sessions === null && !sessionsFailed ? (
        <p className="text-muted-foreground">Cargando sesiones…</p>
      ) : null}
      {sessions?.length === 0 ? (
        <p className="text-muted-foreground">No hay sesiones esta semana</p>
      ) : null}

      {sessions && sessions.length > 0 ? (
        <ul aria-label="Sesiones" className="space-y-3">
          {sessions.map((session) => {
            const title = `${SESSION_KIND_LABEL[session.kind]} ${formatShortDay(session.held_on)}`;
            return (
              <li key={session.id} className="flex items-center gap-4 rounded-3xl border-2 bg-card p-4">
                <span className="w-24 shrink-0 rounded-2xl bg-primary/10 px-2 py-3 text-center text-base font-extrabold text-primary">
                  {formatShortDay(session.held_on)}
                </span>
                <span className="flex-1">
                  <span className="block text-xl font-extrabold">{SESSION_KIND_LABEL[session.kind]}</span>
                  {session.notes ? (
                    <span className="block text-muted-foreground">{session.notes}</span>
                  ) : null}
                </span>
                <Button
                  aria-label={`Pasar lista: ${title}`}
                  disabled={players === null}
                  onClick={() => setAttendanceOf(session)}
                >
                  Pasar lista
                </Button>
                <Button
                  variant="outline"
                  aria-label={`Victorias: ${title}`}
                  disabled={players === null}
                  onClick={() => setWinsOf(session)}
                >
                  Victorias
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <SessionFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(created) => {
          setCreating(false);
          // Si la sesión cae en otra semana, se muestra esa semana para que se vea.
          setWeek(weekStartOf(created.held_on));
          setSessionsKey((key) => key + 1);
        }}
      />
      <AttendanceDialog
        session={attendanceOf}
        players={players ?? []}
        onClose={() => setAttendanceOf(null)}
      />
      <WinsDialog session={winsOf} players={players ?? []} onClose={() => setWinsOf(null)} />
    </div>
  );
}
