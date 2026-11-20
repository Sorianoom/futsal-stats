"use client";

import { useState } from "react";

import { BidDialog } from "@/components/fantasy/bid-dialog";
import { HotListing } from "@/components/fantasy/hot-listing";
import { MarketRow } from "@/components/fantasy/market-row";
import { FANTASY_CARD, FANTASY_HEADING } from "@/components/fantasy/styles";
import { Button } from "@/components/ui/button";
import type { MarketListing } from "@/lib/api/fantasy-types";
import { hottest } from "@/lib/fantasy/form";
import { cn } from "@/lib/utils";
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

type MarketFilter = "all" | "field" | "goalkeeper" | "mine";

const FILTERS: { id: MarketFilter; label: string; matches: (listing: MarketListing) => boolean }[] = [
  { id: "all", label: "Todos", matches: () => true },
  { id: "field", label: "Campo", matches: (listing) => listing.position === "field" },
  { id: "goalkeeper", label: "Porteros", matches: (listing) => listing.position === "goalkeeper" },
  { id: "mine", label: "Mis pujas", matches: (listing) => listing.my_bid !== null },
];

/** Ventas abiertas del mercado (banca y participantes) y mis pujas. */
export function MarketPanel({ balance, ownedPlayers, onChanged }: MarketPanelProps) {
  const { data: market, failed, reload } = useApiQuery(fantasyMarketQuery.key, fantasyMarketQuery.fetch);
  const [bidding, setBidding] = useState<MarketListing | null>(null);
  const [filter, setFilter] = useState<MarketFilter>("all");
  const now = useNow();
  const listings = market?.listings ?? [];
  const biddable = listings.filter((listing) => !listing.mine && !ownedPlayers.has(listing.player_id));
  const hot = filter === "all" ? hottest(biddable) : null;
  const visible = listings.filter(FILTERS.find((candidate) => candidate.id === filter)!.matches);

  return (
    <section aria-labelledby="market-heading" className={`${FANTASY_CARD} space-y-3`}>
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
      {hot ? <HotListing listing={hot} onBid={() => setBidding(hot)} /> : null}
      {listings.length > 0 ? (
        <div role="group" aria-label="Filtrar el mercado" className="grid grid-cols-4 gap-1 rounded-2xl bg-muted p-1">
          {FILTERS.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              aria-pressed={filter === candidate.id}
              onClick={() => setFilter(candidate.id)}
              className={cn(
                "min-h-10 rounded-xl px-1 text-sm font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                filter === candidate.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {candidate.label}
            </button>
          ))}
        </div>
      ) : null}
      {listings.length > 0 && visible.length === 0 ? (
        <p className="py-4 text-center text-muted-foreground">No hay nada con este filtro.</p>
      ) : null}
      {visible.length > 0 ? (
        <ul aria-label="Ventas abiertas" className="flex flex-col gap-2">
          {visible.map((listing) => (
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
