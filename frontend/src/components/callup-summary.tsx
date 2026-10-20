import type { Callup, Selection } from "@/lib/api/types";

interface SelectionCardProps {
  title: string;
  selection: Selection;
  nameOf: (playerId: string) => string;
}

function pluralSlots(count: number): string {
  return `${count} ${count === 1 ? "plaza" : "plazas"}`;
}

function SelectionCard({ title, selection, nameOf }: SelectionCardProps) {
  const headingId = `callup-${title.toLowerCase()}`;
  const confirmed = selection.guaranteed.map(nameOf).join(", ");
  const contenders = selection.tied.map(nameOf).join(", ");

  return (
    <section aria-labelledby={headingId} className="space-y-2 rounded-xl border bg-card p-4">
      <h2 id={headingId} className="text-lg font-semibold">
        {title}
      </h2>
      <p className="text-base">{confirmed || "Nadie confirmado todavía"}</p>
      {selection.open_slots > 0 ? (
        <p className="text-base font-medium text-amber-700 dark:text-amber-400">
          {contenders
            ? `${pluralSlots(selection.open_slots)} por decidir entre: ${contenders}`
            : `${pluralSlots(selection.open_slots)} sin cubrir`}
        </p>
      ) : null}
    </section>
  );
}

export function CallupSummary({ callup }: { callup: Callup }) {
  const names = new Map(callup.ranking.map((player) => [player.player_id, player.name]));
  const nameOf = (playerId: string) => names.get(playerId) ?? "Jugador desconocido";

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <SelectionCard title="Campo" selection={callup.field} nameOf={nameOf} />
      <SelectionCard title="Porteros" selection={callup.goalkeepers} nameOf={nameOf} />
      <SelectionCard title="Titulares" selection={callup.starters} nameOf={nameOf} />
    </div>
  );
}
