"use client";

import { useState } from "react";

import { CopyListingStatus } from "@/components/fantasy/copy-listing-status";
import { ListCopyDialog } from "@/components/fantasy/list-copy-dialog";
import { RaiseClauseDialog } from "@/components/fantasy/raise-clause-dialog";
import { SellCopyDialog } from "@/components/fantasy/sell-copy-dialog";
import { FANTASY_CARD, FANTASY_HEADING } from "@/components/fantasy/styles";
import { ValueChange } from "@/components/fantasy/value-change";
import { Button } from "@/components/ui/button";
import { Spark } from "@/components/fantasy/spark";
import { PlayerAvatar } from "@/components/player-avatar";
import type { SquadCopy } from "@/lib/api/fantasy-types";
import { formatMoney } from "@/lib/fantasy/format";
import { tierOf } from "@/lib/fantasy/form";
import { POSITION_LABEL } from "@/lib/labels";

interface RowProps {
  copy: SquadCopy;
  onList: () => void;
  onSell: () => void;
  onRaise: () => void;
  onChanged: () => void;
}

function SquadRow({ copy, onList, onSell, onRaise, onChanged }: RowProps) {
  return (
    <li className="space-y-2 py-3">
      <div className="flex min-h-12 items-center gap-3">
        <PlayerAvatar
          name={copy.name}
          dorsal={copy.dorsal}
          photoUrl={copy.photo_url}
          className={`tier-${tierOf(copy.last_points)} size-12 rounded-2xl text-lg tabular-nums`}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{copy.name}</span>
          <span className="block text-sm text-muted-foreground">{POSITION_LABEL[copy.position]}</span>
          <Spark points={copy.recent_points ?? []} className="mt-1" />
        </span>
        <span className="flex flex-col items-end">
          <span className="font-extrabold tabular-nums">{formatMoney(copy.value)}</span>
          <ValueChange change={copy.value_change} />
          <span className="text-sm text-muted-foreground tabular-nums">{`Cláusula ${formatMoney(copy.clause)}`}</span>
        </span>
      </div>
      {copy.listing ? (
        <CopyListingStatus copyId={copy.copy_id} listing={copy.listing} onChanged={onChanged} />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {copy.listing ? null : (
          <Button variant="outline" className="rounded-xl" onClick={onList}>
            Poner a la venta
          </Button>
        )}
        <Button variant="outline" className="rounded-xl" onClick={onRaise}>
          Subir cláusula
        </Button>
        <Button variant="ghost" className="rounded-xl" onClick={onSell}>
          Vender a la banca
        </Button>
      </div>
    </li>
  );
}

interface SquadListProps {
  squad: readonly SquadCopy[];
  balance: number;
  onChanged: () => void;
}

/** Mi plantilla: valor, cambio y cláusula de cada jugador, y sus ventas (mercado o banca). */
export function SquadList({ squad, balance, onChanged }: SquadListProps) {
  const [listing, setListing] = useState<SquadCopy | null>(null);
  const [raising, setRaising] = useState<SquadCopy | null>(null);
  const [selling, setSelling] = useState<SquadCopy | null>(null);
  const [sold, setSold] = useState<string | null>(null);

  function done(close: () => void) {
    close();
    onChanged();
  }

  return (
    <section aria-labelledby="squad-heading" className={`${FANTASY_CARD} space-y-1`}>
      <h2 id="squad-heading" className={FANTASY_HEADING}>
        Plantilla
      </h2>
      {sold ? (
        <p role="status" className="font-semibold text-primary">
          {sold}
        </p>
      ) : null}
      {squad.length === 0 ? <p className="text-muted-foreground">Tu plantilla está vacía.</p> : null}
      <ul aria-label="Mi plantilla" className="divide-y">
        {squad.map((copy) => (
          <SquadRow
            key={copy.copy_id}
            copy={copy}
            onList={() => {
              setSold(null);
              setListing(copy);
            }}
            onSell={() => {
              setSold(null);
              setSelling(copy);
            }}
            onRaise={() => {
              setSold(null);
              setRaising(copy);
            }}
            onChanged={onChanged}
          />
        ))}
      </ul>
      <RaiseClauseDialog
        copy={raising}
        balance={balance}
        onClose={() => setRaising(null)}
        onDone={() => done(() => setRaising(null))}
      />
      <ListCopyDialog copy={listing} onClose={() => setListing(null)} onListed={() => done(() => setListing(null))} />
      <SellCopyDialog
        copy={selling}
        onClose={() => setSelling(null)}
        onSold={(sale) => {
          if (selling) setSold(`Has vendido a ${selling.name} a la banca por ${formatMoney(sale.price)}.`);
          done(() => setSelling(null));
        }}
      />
    </section>
  );
}
