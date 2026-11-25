"use client";

import { useRef, useState } from "react";

import { RoundLineup } from "@/components/fantasy/round-lineup";
import { EarningsRanking, OtherLineup, ParticipantPicker, byRoundPoints } from "@/components/fantasy/round-teams";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { StandingsRound } from "@/lib/api/fantasy-types";
import { fantasyRoundQuery, fantasyStandingsQuery } from "@/lib/queries";
import { useApiQuery } from "@/lib/use-api-query";
import { formatShortDay } from "@/lib/weeks";


function RoundBody({ matchId }: { matchId: string }) {
  const query = fantasyRoundQuery(matchId);
  const { data: round, failed, reload } = useApiQuery(query.key, query.fetch);

  if (failed && round === null) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border p-4">
        <p>No se pudo cargar tu alineación de esta jornada</p>
        <Button variant="outline" onClick={reload}>
          Reintentar
        </Button>
      </div>
    );
  }
  if (round === null) return <p className="text-muted-foreground">Cargando…</p>;

  return <RoundLineup round={round} label="Mi alineación" mine />;
}

interface RoundDialogProps {
  round: StandingsRound | null;
  /** Quien mira, si tiene equipo; sin él (cuenta que solo mira) no hay «mi alineación». */
  myId?: string | null;
  onClose: () => void;
}

/**
 * Una jornada: arriba, a quién se mira (por defecto, yo); en medio, su alineación en la pista; y
 * debajo, el beneficio de cada uno. Las alineaciones de los demás solo se ven ya bloqueada.
 */
export function RoundContent({ round, myId }: { round: StandingsRound; myId: string | null }) {
  const { data: standings } = useApiQuery(fantasyStandingsQuery.key, fantasyStandingsQuery.fetch);
  const [selected, setSelected] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const locked = round.status !== "pending";
  const rows = locked && standings ? byRoundPoints(standings.rows, round) : [];
  const current = selected ?? myId ?? rows[0]?.participant_id ?? null;
  const name = rows.find((row) => row.participant_id === current)?.display_name ?? "";

  const pick = (participantId: string) => {
    setSelected(participantId);
    top.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-5">
      <div ref={top} className="scroll-mt-4 space-y-3">
        {rows.length > 0 ? (
          <ParticipantPicker round={round} rows={rows} myId={myId} selected={current} onSelect={pick} />
        ) : null}
        {current !== null && current !== myId ? (
          <OtherLineup key={current} matchId={round.match_id} participantId={current} name={name} />
        ) : myId ? (
          <RoundBody matchId={round.match_id} />
        ) : null}
      </div>
      {rows.length > 0 ? (
        <EarningsRanking round={round} rows={rows} myId={myId} selected={current} onSelect={pick} />
      ) : null}
    </div>
  );
}

/** Una jornada: mi alineación y, ya bloqueada, la de cada participante con sus puntos. */
export function RoundDialog({ round, myId = null, onClose }: RoundDialogProps) {
  return (
    <Dialog open={round !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {round ? `Jornada vs ${round.opponent} · ${formatShortDay(round.held_on)}` : "Jornada"}
          </DialogTitle>
        </DialogHeader>
        {round ? <RoundContent key={round.match_id} round={round} myId={myId} /> : null}
      </DialogContent>
    </Dialog>
  );
}
