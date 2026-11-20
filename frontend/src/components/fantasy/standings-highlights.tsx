import type { FantasyStandings, StandingsRow } from "@/lib/api/fantasy-types";
import { cn } from "@/lib/utils";

/** Puesto con empates: el mismo total comparte puesto (1, 1, 3…). */
export function positionOf(rows: readonly StandingsRow[], row: StandingsRow): number {
  return 1 + rows.filter((other) => other.total > row.total).length;
}

function Initial({ name, className }: { name: string; className: string }) {
  return (
    <span aria-hidden="true" className={cn("tier-mid grid place-items-center rounded-full font-black", className)}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

const STEP = [
  { ring: "bg-linear-160 from-white to-[#9fb0dd]", block: "h-20 bg-muted", face: "size-14 text-xl" },
  { ring: "club-stripes", block: "h-24 bg-gold/45", face: "size-16 text-2xl" },
  { ring: "bg-linear-160 from-[#5b86ff] to-club", block: "h-16 bg-club/25", face: "size-14 text-xl" },
] as const;

/** Los tres primeros, con el líder en medio y más alto. */
export function Podium({ rows, myId }: { rows: readonly StandingsRow[]; myId: string }) {
  if (rows.length < 3 || rows.every((row) => row.total === 0)) return null;
  const order = [rows[1], rows[0], rows[2]];
  return (
    <ol aria-label="Podio" className="grid grid-cols-3 items-end gap-2.5">
      {order.map((row, index) => {
        const step = STEP[index];
        const position = positionOf(rows, row);
        return (
          <li key={row.participant_id} className="flex flex-col items-center gap-1.5" aria-label={`${position}.º ${row.display_name}, ${row.total} puntos`}>
            <span className={cn("rounded-full p-[3px]", step.ring)}>
              <Initial name={row.display_name} className={cn("border-3 border-background", step.face)} />
            </span>
            <span className="max-w-full truncate text-sm font-extrabold">
              {row.display_name}
              {row.participant_id === myId ? " (tú)" : ""}
            </span>
            <span className={cn("flex w-full flex-col items-center justify-center rounded-t-2xl rounded-b-md border", step.block)}>
              <span className="text-2xl leading-none font-black">{position}</span>
              <span className="text-xs font-extrabold tabular-nums">{`${row.total} pts`}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const CHART_HEIGHT = 54;

/** Mi puesto, la distancia al líder y mis puntos de cada jornada ya puntuada. */
export function MySeason({ standings, myId }: { standings: FantasyStandings; myId: string }) {
  const me = standings.rows.find((row) => row.participant_id === myId);
  const played = standings.rounds.filter((round) => round.status !== "pending");
  if (!me || played.length === 0) return null;
  const leader = standings.rows[0];
  const points = played.map((round) => me.points_by_round[round.match_id] ?? 0);
  const top = Math.max(1, ...points);
  const gap = leader.total - me.total;
  return (
    <section aria-label="Tu temporada" className="flex items-center gap-4 rounded-3xl border bg-card p-4">
      <div className="shrink-0">
        <p className="text-xs font-bold text-muted-foreground">Tú vas</p>
        <p className="text-3xl leading-none font-black">{`${positionOf(standings.rows, me)}.º`}</p>
        <p className="text-xs font-bold text-muted-foreground">{gap === 0 ? "Eres el líder" : `a ${gap} del líder`}</p>
      </div>
      <div
        role="img"
        aria-label={`Tus puntos por jornada: ${points.join(", ")}`}
        className="grid h-14 min-w-0 flex-1 items-end gap-1"
        style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
      >
        {played.map((round, index) => (
          <span
            key={round.match_id}
            className={cn("rounded-t-[3px] rounded-b-[1px]", index === played.length - 1 ? "bg-gold" : "bg-primary/45")}
            style={{ height: Math.max(3, Math.round((points[index] / top) * CHART_HEIGHT)) }}
          />
        ))}
      </div>
    </section>
  );
}
