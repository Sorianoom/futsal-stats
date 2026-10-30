"use client";

import { useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { AttendanceDialog } from "@/components/attendance-dialog";
import { SessionFormDialog } from "@/components/session-form-dialog";
import { Button } from "@/components/ui/button";
import { WeekNavigator } from "@/components/week-navigator";
import { WinsDialog } from "@/components/wins-dialog";
import type { TeamSession } from "@/lib/api/types";
import { SESSION_KIND_LABEL } from "@/lib/labels";
import { playersQuery, sessionsQuery } from "@/lib/queries";
import { useApiQuery } from "@/lib/use-api-query";
import { currentWeekStart, formatShortDay, weekStartOf } from "@/lib/weeks";

export default function EntrenosPage() {
  const { user } = useAuth();
  const isHeadCoach = user?.role === "head_coach";
  const [week, setWeek] = useState(() => currentWeekStart());
  const [creating, setCreating] = useState(false);
  const [attendanceOf, setAttendanceOf] = useState<TeamSession | null>(null);
  const [winsOf, setWinsOf] = useState<TeamSession | null>(null);

  // null hasta que llega la plantilla: sin ella no se puede pasar lista ni dar victorias.
  const {
    data: players,
    failed: playersFailed,
    reload: retryPlayers,
  } = useApiQuery(isHeadCoach ? playersQuery.key : null, playersQuery.fetch);
  // La clave lleva la semana: nunca se muestran sesiones de otra semana.
  const sessionsRequest = sessionsQuery(week);
  const {
    data: sessions,
    failed: sessionsFailed,
    reload: retrySessions,
  } = useApiQuery(isHeadCoach ? sessionsRequest.key : null, sessionsRequest.fetch);

  if (!isHeadCoach) {
    return <p className="text-lg">Solo el entrenador puede gestionar los entrenos</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Entrenos</h1>
        <WeekNavigator week={week} onChange={setWeek} />
      </header>

      <Button size="lg" onClick={() => setCreating(true)}>
        Nueva sesión
      </Button>

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
              <li key={session.id} className="flex items-center gap-4 rounded-xl border bg-card p-4">
                <span className="w-20 shrink-0 text-muted-foreground">
                  {formatShortDay(session.held_on)}
                </span>
                <span className="flex-1">
                  <span className="block text-lg font-medium">{SESSION_KIND_LABEL[session.kind]}</span>
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
          retrySessions();
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
