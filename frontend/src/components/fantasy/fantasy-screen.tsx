"use client";

import { useAuth } from "@/components/auth-provider";
import { LineupEditor } from "@/components/fantasy/lineup-editor";
import { NoLeague } from "@/components/fantasy/no-league";
import { Standings } from "@/components/fantasy/standings-table";
import { FANTASY_CARD, FANTASY_HEADING } from "@/components/fantasy/styles";
import { Button } from "@/components/ui/button";
import type { FantasyLeagueView, NextRound, SquadCopy } from "@/lib/api/fantasy-types";
import { formatMoney, lockText } from "@/lib/fantasy/format";
import { POSITION_LABEL } from "@/lib/labels";
import { fantasyMeQuery } from "@/lib/queries";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";
import { formatLongDay } from "@/lib/weeks";

function Balance({ balance }: { balance: number }) {
  const negative = balance < 0;
  return (
    <div className="space-y-1 rounded-3xl bg-foreground p-5 text-background">
      <p className="text-xs font-extrabold tracking-widest text-cta uppercase">Saldo</p>
      <p className={cn("text-4xl leading-none font-extrabold tabular-nums", negative && "text-red-300")}>
        {formatMoney(balance)}
      </p>
      {negative ? (
        <p className="text-sm font-semibold text-background/80">
          Tienes saldo negativo: si sigue así cuando se bloquee la alineación, la jornada puntuará 0.
        </p>
      ) : null}
    </div>
  );
}

function NextRoundCard({ round }: { round: NextRound | null }) {
  return (
    <div className={`${FANTASY_CARD} space-y-1`}>
      <p className={FANTASY_HEADING}>Próxima jornada</p>
      {round ? (
        <>
          <p className="text-2xl font-extrabold">{`vs ${round.opponent}`}</p>
          <p className="text-muted-foreground first-letter:uppercase">{formatLongDay(round.held_on)}</p>
          <p className="font-semibold">{lockText(round.locks_at)}</p>
        </>
      ) : (
        <p className="text-muted-foreground">No hay ninguna jornada programada</p>
      )}
    </div>
  );
}

function SquadList({ squad }: { squad: readonly SquadCopy[] }) {
  return (
    <section aria-labelledby="squad-heading" className={`${FANTASY_CARD} space-y-3`}>
      <h2 id="squad-heading" className={FANTASY_HEADING}>
        Plantilla
      </h2>
      {squad.length === 0 ? <p className="text-muted-foreground">Tu plantilla está vacía.</p> : null}
      <ul aria-label="Mi plantilla" className="divide-y">
        {squad.map((copy) => (
          <li key={copy.copy_id} className="flex min-h-14 items-center gap-3 py-2">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-extrabold text-primary tabular-nums">
              {copy.dorsal}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{copy.name}</span>
              <span className="block text-sm text-muted-foreground">{POSITION_LABEL[copy.position]}</span>
            </span>
            <span className="font-extrabold tabular-nums">{formatMoney(copy.value)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function League({ view, onChanged }: { view: FantasyLeagueView; onChanged: () => void }) {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <Balance balance={view.me.balance} />
        <NextRoundCard round={view.next_round} />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <LineupEditor
          squad={view.squad}
          lineup={view.lineup}
          nextMatchId={view.next_round?.match_id ?? null}
          onSaved={onChanged}
        />
        <SquadList squad={view.squad} />
      </div>
      <Standings myId={view.me.participant_id} />
    </>
  );
}

export function FantasyScreen() {
  const { user } = useAuth();
  const { data, failed, reload } = useApiQuery(fantasyMeQuery.key, fantasyMeQuery.fetch);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-4xl font-extrabold tracking-tight">Fantasy</h1>
      {failed ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border p-4">
          <p>No se pudo cargar el Fantasy</p>
          <Button variant="outline" onClick={reload}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {data === null && !failed ? <p className="text-muted-foreground">Cargando…</p> : null}
      {data && data.league === null ? (
        <NoLeague canCreate={user?.role === "head_coach"} onCreated={reload} />
      ) : null}
      {data && data.league !== null ? <League view={data} onChanged={reload} /> : null}
    </div>
  );
}
