"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { RoundSlot, StandingsRound } from "@/lib/api/fantasy-types";
import { formatPoints, formatRating } from "@/lib/fantasy/format";
import { POSITION_LABEL } from "@/lib/labels";
import { fantasyRoundQuery } from "@/lib/queries";
import { useApiQuery } from "@/lib/use-api-query";
import { formatShortDay } from "@/lib/weeks";

const HEADER = "px-2 py-2 text-left text-xs font-extrabold tracking-wider text-muted-foreground uppercase";
const CELL = "px-2 py-2.5 text-base tabular-nums";

function SlotRow({ slot }: { slot: RoundSlot }) {
  return (
    <tr className="border-t">
      <td className={`${CELL} text-muted-foreground`}>{POSITION_LABEL[slot.slot]}</td>
      <th scope="row" className={`${CELL} text-left font-bold`}>
        {slot.name ?? <span className="font-medium text-muted-foreground">Vacío · 0 puntos</span>}
      </th>
      <td className={CELL}>{slot.name ? formatRating(slot.rating) : "—"}</td>
      <td className={CELL}>{slot.name ? slot.goals : "—"}</td>
      <td className={`${CELL} font-extrabold`}>{slot.points}</td>
    </tr>
  );
}

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

  return (
    <div className="space-y-3">
      {round.status === "pending" ? (
        <p className="rounded-xl border p-3 text-muted-foreground">
          Jornada pendiente: los puntos llegan cuando se cierre el partido.
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table aria-label="Mi alineación" className="w-full border-collapse">
          <thead>
            <tr>
              <th scope="col" className={HEADER}>Puesto</th>
              <th scope="col" className={HEADER}>Jugador</th>
              <th scope="col" className={HEADER}>Nota</th>
              <th scope="col" className={HEADER}>Goles</th>
              <th scope="col" className={HEADER}>Puntos</th>
            </tr>
          </thead>
          <tbody>
            {round.slots.map((slot, index) => (
              <SlotRow key={slot.copy_id ?? `empty-${index}`} slot={slot} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-lg font-extrabold">{`Total: ${formatPoints(round.total)}`}</p>
      <p className="text-sm text-muted-foreground">Puntos = nota redondeada + 2 por gol. Sin nota, 0.</p>
    </div>
  );
}

interface RoundDialogProps {
  round: StandingsRound | null;
  onClose: () => void;
}

/** Mi alineación de una jornada, con la nota, los goles y los puntos de cada hueco. */
export function RoundDialog({ round, onClose }: RoundDialogProps) {
  return (
    <Dialog open={round !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {round ? `Jornada vs ${round.opponent} · ${formatShortDay(round.held_on)}` : "Jornada"}
          </DialogTitle>
        </DialogHeader>
        {round ? <RoundBody matchId={round.match_id} /> : null}
      </DialogContent>
    </Dialog>
  );
}
