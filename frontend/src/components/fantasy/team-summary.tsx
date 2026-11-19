import type { FantasyLeagueView } from "@/lib/api/fantasy-types";
import { formatMoney } from "@/lib/fantasy/format";
import { cn } from "@/lib/utils";

const NEGATIVE_WARNING =
  "Con saldo negativo al bloquearse la alineación, la jornada puntúa 0. Vende algún jugador para volver a positivo.";

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5 rounded-2xl bg-white/10 px-3 py-2.5">
      <dt className="text-[11px] font-extrabold tracking-widest text-slate-300 uppercase">{label}</dt>
      <dd className="text-lg font-extrabold tabular-nums">{value}</dd>
    </div>
  );
}

/** Saldo, valor del equipo y plazas usadas, visibles en todas las pestañas. */
export function TeamSummary({ view }: { view: FantasyLeagueView }) {
  const balance = view.me.balance;
  const negative = balance < 0;
  return (
    <section aria-label="Resumen" className="space-y-3">
      <dl className="grid gap-4 rounded-3xl bg-foreground p-5 text-background md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:items-end">
        <div className="space-y-1">
          <dt className="text-xs font-extrabold tracking-widest text-cta uppercase">Saldo</dt>
          <dd className={cn("text-5xl leading-none font-extrabold tabular-nums", negative && "text-red-300")}>
            {formatMoney(balance)}
          </dd>
        </div>
        <div className="grid grid-cols-2 gap-2">
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
