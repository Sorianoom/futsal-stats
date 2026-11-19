import { Button } from "@/components/ui/button";
import { PlayerAvatar } from "@/components/player-avatar";
import type { MarketListing } from "@/lib/api/fantasy-types";
import { formatMoment, formatMoney } from "@/lib/fantasy/format";
import { closingIn } from "@/lib/fantasy/market";
import { POSITION_LABEL } from "@/lib/labels";

const FIGURE = "rounded-xl bg-muted px-2 py-1 text-sm font-semibold tabular-nums";

interface MarketRowProps {
  listing: MarketListing;
  now: Date;
  /** Ya tengo una copia de este jugador: no puedo pujar por otra. */
  owned: boolean;
  onBid: () => void;
}

/** Una venta abierta: jugador, quién la vende, cifras, cierre y mi puja. */
export function MarketRow({ listing, now, owned, onBid }: MarketRowProps) {
  return (
    <li className="flex flex-col gap-3 py-3 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <PlayerAvatar
          name={listing.name}
          dorsal={listing.dorsal}
          photoUrl={listing.photo_url}
          className="size-10 rounded-xl bg-primary/10 text-primary tabular-nums"
        />
        <span className="min-w-0">
          <span className="block truncate font-bold">{listing.name}</span>
          <span className="block text-sm text-muted-foreground">
            {`${POSITION_LABEL[listing.position]} · ${listing.seller ? `Vende ${listing.seller.display_name}` : "Banca"}`}
          </span>
          <span className="block text-sm text-muted-foreground">
            {"Cierra "}
            <time dateTime={listing.closes_at}>{formatMoment(listing.closes_at)}</time>
            {` · en ${closingIn(listing.closes_at, now)}`}
          </span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={FIGURE}>{`Valor ${formatMoney(listing.value)}`}</span>
        <span className={FIGURE}>{`Mínimo ${formatMoney(listing.min_bid)}`}</span>
        {listing.my_bid !== null ? (
          <span className="rounded-xl bg-cta/20 px-2 py-1 text-sm font-extrabold tabular-nums">
            {`Tu puja ${formatMoney(listing.my_bid)}`}
          </span>
        ) : null}
        {listing.mine ? (
          <span className="text-sm font-bold text-muted-foreground">La vendes tú</span>
        ) : owned ? (
          <span className="text-sm font-bold text-muted-foreground">Ya lo tienes</span>
        ) : (
          <Button variant={listing.my_bid === null ? "cta" : "outline"} className="rounded-xl" onClick={onBid}>
            {listing.my_bid === null ? "Pujar" : "Cambiar puja"}
          </Button>
        )}
      </div>
    </li>
  );
}
