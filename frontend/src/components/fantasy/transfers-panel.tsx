"use client";

import { FANTASY_CARD, FANTASY_HEADING } from "@/components/fantasy/styles";
import { Button } from "@/components/ui/button";
import type { ParticipantRef, Transfer, TransferKind } from "@/lib/api/fantasy-types";
import { formatMoment, formatMoney } from "@/lib/fantasy/format";
import { fantasyTransfersQuery } from "@/lib/queries";
import { useApiQuery } from "@/lib/use-api-query";

const KIND_LABEL: Record<TransferKind, string> = {
  market: "Mercado",
  bank_sale: "Venta a la banca",
  clause: "Clausulazo",
};

function who(participant: ParticipantRef | null): string {
  return participant ? participant.display_name : "Banca";
}

function TransferRow({ transfer }: { transfer: Transfer }) {
  return (
    <li className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{transfer.name}</span>
        <span className="block text-sm text-muted-foreground">{`${who(transfer.from)} → ${who(transfer.to)}`}</span>
      </span>
      <span className="text-right">
        <span className="block font-extrabold tabular-nums">{formatMoney(transfer.price)}</span>
        <span className="block text-sm text-muted-foreground">
          {`${KIND_LABEL[transfer.kind]} · `}
          <time dateTime={transfer.at}>{formatMoment(transfer.at)}</time>
        </span>
      </span>
    </li>
  );
}

/** Últimos movimientos de la liga, del más reciente al más antiguo. */
export function TransfersPanel() {
  const { data, failed, reload } = useApiQuery(fantasyTransfersQuery.key, fantasyTransfersQuery.fetch);

  return (
    <section aria-labelledby="transfers-heading" className={`${FANTASY_CARD} space-y-2`}>
      <h2 id="transfers-heading" className={FANTASY_HEADING}>
        Fichajes
      </h2>
      {failed ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border p-4">
          <p>No se pudieron cargar los fichajes</p>
          <Button variant="outline" onClick={reload}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {data === null && !failed ? <p className="text-muted-foreground">Cargando fichajes…</p> : null}
      {data && data.transfers.length === 0 ? (
        <p className="text-muted-foreground">Todavía no hay fichajes en la liga.</p>
      ) : null}
      {data && data.transfers.length > 0 ? (
        <ul aria-label="Fichajes de la liga" className="divide-y">
          {data.transfers.map((transfer, index) => (
            <TransferRow key={`${transfer.at}-${transfer.player_id}-${index}`} transfer={transfer} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
