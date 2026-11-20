import { PlayerAvatar } from "@/components/player-avatar";
import type { MarketListing } from "@/lib/api/fantasy-types";
import { formatMoney } from "@/lib/fantasy/format";
import { HOT_ROUNDS, hotPoints } from "@/lib/fantasy/form";
import { POSITION_LABEL } from "@/lib/labels";

interface HotListingProps {
  listing: MarketListing;
  onBid: () => void;
}

/** El jugador del mercado más en racha (más puntos en sus 3 últimas jornadas), destacado arriba. */
export function HotListing({ listing, onBid }: HotListingProps) {
  const points = hotPoints(listing.recent_points ?? []);
  return (
    <section
      aria-label={`En racha: ${listing.name}`}
      className="relative h-44 overflow-hidden rounded-3xl bg-linear-120 from-gold via-[#e0a800] to-[#8a6400] text-[#0a1633]"
    >
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 w-40 bg-[repeating-linear-gradient(90deg,rgb(31_79_191/0.9)_0_16px,transparent_16px_32px)]"
      />
      <PlayerAvatar
        name={listing.name}
        dorsal={listing.dorsal}
        photoUrl={listing.photo_url}
        className="absolute right-4 bottom-0 h-36 w-32 rounded-t-full rounded-b-none bg-[#0a1633]/15 text-6xl text-white"
      />
      <div className="absolute inset-y-4 left-4 flex w-52 flex-col">
        <span className="self-start rounded-full bg-[#0a1633] px-2.5 py-0.5 text-xs font-extrabold text-gold">
          {`EN RACHA · ${points} pts en ${HOT_ROUNDS} jornadas`}
        </span>
        <span className="mt-2 text-2xl leading-none font-black">{listing.name}</span>
        <span className="text-xs font-bold opacity-85">
          {`${POSITION_LABEL[listing.position]} · ${listing.seller ? `vende ${listing.seller.display_name}` : "Banca"}`}
        </span>
        <button
          type="button"
          onClick={onBid}
          className="mt-auto h-11 self-start rounded-xl bg-[#0a1633] px-4 text-sm font-extrabold text-white outline-none focus-visible:ring-3 focus-visible:ring-white"
        >
          {listing.my_bid !== null ? `Tu puja ${formatMoney(listing.my_bid)}` : `Pujar · ${formatMoney(listing.min_bid)}`}
        </button>
      </div>
    </section>
  );
}
