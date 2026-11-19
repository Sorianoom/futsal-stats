"use client";

import { useState } from "react";

import { BuyClauseDialog } from "@/components/fantasy/buy-clause-dialog";
import { FANTASY_CARD, FANTASY_HEADING } from "@/components/fantasy/styles";
import { Button } from "@/components/ui/button";
import { PlayerAvatar } from "@/components/player-avatar";
import type { ClauseCopy } from "@/lib/api/fantasy-types";
import { clauseBlock, type ClauseBlock } from "@/lib/fantasy/clauses";
import { formatMoment, formatMoney } from "@/lib/fantasy/format";
import { POSITION_LABEL } from "@/lib/labels";
import { fantasyClausesQuery } from "@/lib/queries";
import { useApiQuery } from "@/lib/use-api-query";
import { useNow } from "@/lib/use-now";

const FIGURE = "rounded-xl bg-muted px-2 py-1 text-sm font-semibold tabular-nums";

interface RowProps {
  copy: ClauseCopy;
  /** Por qué no se puede clausular ahora; null si se puede. */
  block: ClauseBlock | null;
  onBuy: () => void;
}

function ClauseRow({ copy, block, onBuy }: RowProps) {
  return (
    <li className="flex flex-col gap-3 py-3 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <PlayerAvatar
          name={copy.name}
          dorsal={copy.dorsal}
          photoUrl={copy.photo_url}
          className="size-10 rounded-xl bg-primary/10 text-primary tabular-nums"
        />
        <span className="min-w-0">
          <span className="block truncate font-bold">{copy.name}</span>
          <span className="block text-sm text-muted-foreground">
            {`${POSITION_LABEL[copy.position]} · De ${copy.owner.display_name}`}
          </span>
          {block === "protected" ? (
            <span className="block text-sm text-muted-foreground">
              {"Protegida hasta "}
              <time dateTime={copy.protected_until}>{formatMoment(copy.protected_until)}</time>
            </span>
          ) : null}
          {block === "already_have" ? (
            <span className="block text-sm text-muted-foreground">Ya lo tienes en tu plantilla</span>
          ) : null}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={FIGURE}>{`Valor ${formatMoney(copy.value)}`}</span>
        <span className={FIGURE}>{`Cláusula ${formatMoney(copy.clause)}`}</span>
        {block === null ? (
          <Button variant="cta" className="rounded-xl" onClick={onBuy}>
            Clausular
          </Button>
        ) : null}
      </div>
    </li>
  );
}

interface ClausesPanelProps {
  balance: number;
  /** Mi plantilla no tiene hueco: no puedo fichar a nadie. */
  squadFull: boolean;
  onChanged: () => void;
}

/** Las copias de los demás con su cláusula; se pagan para fichar al momento (clausulazo). */
export function ClausesPanel({ balance, squadFull, onChanged }: ClausesPanelProps) {
  const { data, failed, reload } = useApiQuery(fantasyClausesQuery.key, fantasyClausesQuery.fetch);
  const now = useNow();
  const [buying, setBuying] = useState<ClauseCopy | null>(null);
  const [bought, setBought] = useState<string | null>(null);
  const others = data ? data.copies.filter((copy) => !copy.mine) : [];
  const ownedPlayers = new Set(data ? data.copies.filter((copy) => copy.mine).map((copy) => copy.player_id) : []);

  return (
    <section aria-labelledby="clauses-heading" className={`${FANTASY_CARD} space-y-2`}>
      <h2 id="clauses-heading" className={FANTASY_HEADING}>
        Cláusulas
      </h2>
      <p className="text-muted-foreground">
        Paga la cláusula de una copia y es tuya al momento. Cada copia queda protegida 7 días tras ficharla, y el día
        de partido no se puede clausular.
      </p>
      {bought ? (
        <p role="status" className="font-semibold text-primary">
          {bought}
        </p>
      ) : null}
      {data?.match_day ? (
        <p className="rounded-xl bg-muted p-3 font-semibold">Hoy hay partido: no se puede clausular hasta mañana.</p>
      ) : null}
      {data && !data.match_day && squadFull ? (
        <p className="rounded-xl bg-muted p-3 font-semibold">
          Tu plantilla está llena: vende a alguien para poder clausular.
        </p>
      ) : null}
      {failed ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border p-4">
          <p>No se pudieron cargar las cláusulas</p>
          <Button variant="outline" onClick={reload}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {data === null && !failed ? <p className="text-muted-foreground">Cargando cláusulas…</p> : null}
      {data && others.length === 0 ? (
        <p className="text-muted-foreground">Nadie más tiene jugadores todavía.</p>
      ) : null}
      {data && others.length > 0 ? (
        <ul aria-label="Cláusulas de la liga" className="divide-y">
          {others.map((copy) => {
            const block = clauseBlock(copy, { matchDay: data.match_day, now, ownedPlayers, squadFull });
            return (
              <ClauseRow
                key={copy.copy_id}
                copy={copy}
                block={block}
                onBuy={() => {
                  setBought(null);
                  setBuying(copy);
                }}
              />
            );
          })}
        </ul>
      ) : null}
      <BuyClauseDialog
        copy={buying}
        balance={balance}
        onClose={() => setBuying(null)}
        onBought={(purchase) => {
          if (buying) setBought(`Has fichado a ${buying.name} por ${formatMoney(purchase.price)}.`);
          setBuying(null);
          reload();
          onChanged();
        }}
      />
    </section>
  );
}
