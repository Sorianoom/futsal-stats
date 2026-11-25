"use client";

import { HalfCourt } from "@/components/half-court";
import type { GoalStat } from "@/lib/api/stats-types";
import { goalTagLabel } from "@/lib/match/goal-detail";

const HEADING = "text-xs font-extrabold tracking-widest text-muted-foreground uppercase";

/** Cuántas veces sale cada tipo, del más repetido al menos (empate: por orden alfabético). */
export function countTags(goals: readonly GoalStat[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const goal of goals) for (const tag of goal.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function GoalSide({ goals, forTeam }: { goals: readonly GoalStat[]; forTeam: boolean }) {
  const title = forTeam ? "Goles a favor" : "Goles en contra";
  const tags = countTags(goals);
  const withoutType = goals.filter((goal) => goal.tags.length === 0).length;
  const points = goals.flatMap((goal) =>
    goal.x !== null && goal.y !== null ? [{ x: goal.x, y: goal.y, tone: forTeam ? ("for" as const) : ("against" as const) }] : [],
  );
  const most = tags[0]?.[1] ?? 0;

  return (
    <section aria-label={title} className="space-y-3 rounded-3xl border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-extrabold">{title}</h3>
        <span className="text-2xl font-black tabular-nums">{goals.length}</span>
      </div>
      {tags.length > 0 ? (
        <ul aria-label={`Tipos de ${title.toLowerCase()}`} className="space-y-1.5">
          {tags.map(([tag, count]) => (
            <li key={tag} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-sm">
              <span className="truncate font-bold">{goalTagLabel(tag, forTeam)}</span>
              <span className="font-extrabold tabular-nums">{count}</span>
              <span aria-hidden="true" className="col-span-2 h-1.5 rounded-full bg-muted">
                <span
                  className={forTeam ? "block h-full rounded-full bg-sky-500" : "block h-full rounded-full bg-destructive"}
                  style={{ width: `${(count / most) * 100}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {withoutType > 0 ? (
        <p className="text-sm text-muted-foreground">{`${plural(withoutType, "gol", "goles")} sin tipo anotado`}</p>
      ) : null}
      {points.length > 0 ? (
        <HalfCourt
          label={`${title}: ${plural(points.length, "punto", "puntos")} desde donde se marcaron`}
          points={points}
          className="mx-auto max-w-64"
        />
      ) : null}
    </section>
  );
}

/** Goles a favor y en contra por tipo, con un mapa de media pista desde donde se marcaron. */
export function GoalsSummary({ goals }: { goals: readonly GoalStat[] }) {
  if (goals.length === 0) return null;
  return (
    <section aria-labelledby="goals-summary-heading" className="space-y-2">
      <h2 id="goals-summary-heading" className={HEADING}>
        Cómo fueron los goles
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        <GoalSide goals={goals.filter((goal) => !goal.for_team)} forTeam={false} />
        <GoalSide goals={goals.filter((goal) => goal.for_team)} forTeam />
      </div>
    </section>
  );
}
