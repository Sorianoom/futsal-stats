import type { FantasyLeagueView } from "@/lib/api/fantasy-types";
import { formatMoney } from "@/lib/fantasy/format";
import { cn } from "@/lib/utils";

const NEGATIVE_WARNING =
  "Con saldo negativo al bloquearse la alineación, la jornada puntúa 0. Vende algún jugador para volver a positivo.";

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5 text-right">
      <dt className="text-[11px] font-bold text-muted-foreground">{label}</dt>
      <dd className="text-xl font-extrabold tabular-nums">{value}</dd>
    </div>
  );
}

/** Saldo, valor del equipo y plazas usadas, visibles en todas las pestañas. */
export function TeamSummary({ view }: { view: FantasyLeagueView }) {
  const balance = view.me.balance;
  const negative = balance < 0;
  return (
    <section aria-label="Resumen" className="space-y-3">
      <dl className="flex flex-wrap items-end justify-between gap-4 rounded-3xl border bg-card p-5">
        <div className="space-y-1">
          <dt className="text-xs font-bold text-muted-foreground">Saldo</dt>
          <dd
            className={cn(
              "text-5xl leading-[0.9] font-black tracking-tight tabular-nums",
              negative ? "text-bad" : "text-foreground dark:text-gold",
            )}
          >
            {formatMoney(balance)}
          </dd>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          <Figure label="Valor del equipo" value={formatMoney(view.me.team_value)} />
          <Figure label="Plazas" value={`${view.squad.length}/${view.me.squad_limit}`} />
        </div>
      </dl>
      {negative ? (
        <p role="alert" className="rounded-2xl border-2 border-destructive/40 bg-destructive/10 p-4 font-semibold text-destructive">
          {NEGATIVE_WARNING}
        </p>
      ) : null}
    </section>
  );
}
