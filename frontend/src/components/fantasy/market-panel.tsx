"use client";

import { useState } from "react";

import { BidDialog } from "@/components/fantasy/bid-dialog";
import { MarketRow } from "@/components/fantasy/market-row";
import { FANTASY_CARD, FANTASY_HEADING } from "@/components/fantasy/styles";
import { Button } from "@/components/ui/button";
import type { MarketListing } from "@/lib/api/fantasy-types";
import { fantasyMarketQuery } from "@/lib/queries";
import { useApiQuery } from "@/lib/use-api-query";
import { useNow } from "@/lib/use-now";

interface MarketPanelProps {
  balance: number;
  /** Jugadores de los que ya tengo copia: en sus ventas no se puede pujar. */
  ownedPlayers: ReadonlySet<string>;
  /** Tras una escritura recarga mi vista: el saldo pudo cambiar (se procesan cierres vencidos). */
  onChanged: () => void;
}

/** Ventas abiertas del mercado (banca y participantes) y mis pujas. */
export function MarketPanel({ balance, ownedPlayers, onChanged }: MarketPanelProps) {
  const { data: market, failed, reload } = useApiQuery(fantasyMarketQuery.key, fantasyMarketQuery.fetch);
  const [bidding, setBidding] = useState<MarketListing | null>(null);
  const now = useNow();

  return (
    <section aria-labelledby="market-heading" className={`${FANTASY_CARD} space-y-2`}>
      <h2 id="market-heading" className={FANTASY_HEADING}>
        Mercado
      </h2>
      <p className="text-sm text-muted-foreground">
        Cada día a las 00:00 salen jugadores de la banca. Pujas en sobre cerrado: pujar no reserva saldo, pero si
        ganas varias puedes quedarte en negativo.
      </p>
      {failed ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border p-4">
          <p>No se pudo cargar el mercado</p>
          <Button variant="outline" onClick={reload}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {market === null && !failed ? <p className="text-muted-foreground">Cargando mercado…</p> : null}
      {market && market.listings.length === 0 ? (
        <p className="text-muted-foreground">No hay ninguna venta abierta. Vuelve después de las 00:00.</p>
      ) : null}
      {market && market.listings.length > 0 ? (
        <ul aria-label="Ventas abiertas" className="divide-y">
          {market.listings.map((listing) => (
            <MarketRow
              key={listing.listing_id}
              listing={listing}
              now={now}
              owned={ownedPlayers.has(listing.player_id)}
              onBid={() => setBidding(listing)}
            />
          ))}
        </ul>
      ) : null}
      <BidDialog
        listing={bidding}
        balance={balance}
        onClose={() => setBidding(null)}
        onDone={() => {
          setBidding(null);
          reload();
          onChanged();
        }}
      />
    </section>
  );
}
