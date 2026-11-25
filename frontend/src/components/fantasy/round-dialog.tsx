"use client";

import { useState } from "react";

import { RoundLineup } from "@/components/fantasy/round-lineup";
import { OtherLineup, RoundTeams } from "@/components/fantasy/round-teams";
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

/** Nombre de un participante según la clasificación. */
function useDisplayName(participantId: string | null): string {
  const { data: standings } = useApiQuery(fantasyStandingsQuery.key, fantasyStandingsQuery.fetch);
  return standings?.rows.find((row) => row.participant_id === participantId)?.display_name ?? "";
}

function RoundContent({ round, myId }: { round: StandingsRound; myId: string | null }) {
  const [selected, setSelected] = useState<string | null>(null);
  const name = useDisplayName(selected);
  const viewingOther = selected !== null && selected !== myId;

  return (
    <div className="space-y-5">
      {viewingOther ? (
        <div className="space-y-3">
          <OtherLineup matchId={round.match_id} participantId={selected} name={name} />
          {myId ? (
            <Button variant="outline" onClick={() => setSelected(null)}>
              Volver a mi alineación
            </Button>
          ) : null}
        </div>
      ) : myId ? (
        <RoundBody matchId={round.match_id} />
      ) : null}
      {round.status === "pending" ? null : (
        <RoundTeams round={round} myId={myId} selected={selected ?? myId} onSelect={setSelected} />
      )}
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
