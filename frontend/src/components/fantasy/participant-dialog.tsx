"use client";

import { RoundLineup } from "@/components/fantasy/round-dialog";
import { Spark } from "@/components/fantasy/spark";
import { PlayerAvatar } from "@/components/player-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ParticipantTeam, SquadCopy, StandingsRow } from "@/lib/api/fantasy-types";
import { formatMoney, formatPoints } from "@/lib/fantasy/format";
import { tierOf } from "@/lib/fantasy/form";
import { POSITION_LABEL } from "@/lib/labels";
import { fantasyParticipantQuery } from "@/lib/queries";
import { useApiQuery } from "@/lib/use-api-query";
import { formatShortDay } from "@/lib/weeks";

const SECTION_TITLE = "text-lg font-extrabold";

function SquadRow({ copy }: { copy: SquadCopy }) {
  return (
    <li className="flex min-h-12 items-center gap-3 py-2">
      <PlayerAvatar
        name={copy.name}
        dorsal={copy.dorsal}
        photoUrl={copy.photo_url}
        className={`tier-${tierOf(copy.last_points)} size-11 rounded-2xl text-base tabular-nums`}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{copy.name}</span>
        <span className="block text-sm text-muted-foreground">{POSITION_LABEL[copy.position]}</span>
        <Spark points={copy.recent_points ?? []} className="mt-1" />
      </span>
      <span className="flex flex-col items-end tabular-nums">
        <span className="font-extrabold">{formatMoney(copy.value)}</span>
        <span className="text-sm text-muted-foreground">{`Cláusula ${formatMoney(copy.clause)}`}</span>
      </span>
    </li>
  );
}

function TeamBody({ team, total }: { team: ParticipantTeam; total: number }) {
  if (team.private_squad && team.squad.length === 0) {
    return (
      <p className="rounded-xl border p-3 text-muted-foreground">
        Plantilla privada: es una cuenta del cuerpo técnico, así que no se ven sus jugadores ni su alineación.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border p-3">
          <dt className="text-sm text-muted-foreground">Puntos</dt>
          <dd className="text-xl font-extrabold tabular-nums">{formatPoints(total)}</dd>
        </div>
        <div className="rounded-2xl border p-3">
          <dt className="text-sm text-muted-foreground">Valor del equipo</dt>
          <dd className="text-xl font-extrabold tabular-nums">{formatMoney(team.team_value ?? 0)}</dd>
        </div>
      </dl>
      <section className="space-y-2" aria-label="Alineación">
        <h3 className={SECTION_TITLE}>
          {team.last_round
            ? `Alineación vs ${team.last_round.opponent} · ${formatShortDay(team.last_round.held_on)}`
            : "Alineación"}
        </h3>
        {team.last_lineup ? (
          <RoundLineup round={team.last_lineup} label={`Alineación de ${team.display_name}`} />
        ) : (
          <p className="text-muted-foreground">
            Aún no hay ninguna jornada bloqueada. Su alineación se verá cuando se bloquee la próxima.
          </p>
        )}
      </section>
      <section className="space-y-1" aria-label="Plantilla">
        <h3 className={SECTION_TITLE}>{`Plantilla (${team.squad.length})`}</h3>
        {team.squad.length === 0 ? (
          <p className="text-muted-foreground">No tiene jugadores.</p>
        ) : (
          <ul aria-label={`Plantilla de ${team.display_name}`} className="divide-y">
            {team.squad.map((copy) => (
              <SquadRow key={copy.copy_id} copy={copy} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ParticipantBody({ row }: { row: StandingsRow }) {
  const query = fantasyParticipantQuery(row.participant_id);
  const { data: team, failed, reload } = useApiQuery(query.key, query.fetch);

  if (failed && team === null) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border p-4">
        <p>No se pudo cargar su equipo</p>
        <Button variant="outline" onClick={reload}>
          Reintentar
        </Button>
      </div>
    );
  }
  if (team === null) return <p className="text-muted-foreground">Cargando…</p>;
  return <TeamBody team={team} total={row.total} />;
}

interface ParticipantDialogProps {
  row: StandingsRow | null;
  onClose: () => void;
}

/** Equipo de un participante de la clasificación: su última alineación bloqueada y su plantilla. */
export function ParticipantDialog({ row, onClose }: ParticipantDialogProps) {
  return (
    <Dialog open={row !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{row ? row.display_name : "Participante"}</DialogTitle>
        </DialogHeader>
        {row ? <ParticipantBody row={row} /> : null}
      </DialogContent>
    </Dialog>
  );
}
