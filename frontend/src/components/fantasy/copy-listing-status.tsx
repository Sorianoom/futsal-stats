"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { unlistCopy } from "@/lib/api/fantasy";
import type { CopyListing } from "@/lib/api/fantasy-types";
import { actionErrorMessage } from "@/lib/fantasy/errors";
import { formatMoment, formatMoney } from "@/lib/fantasy/format";

const UNLIST_ERROR = "No se pudo retirar la venta. Comprueba la conexión e inténtalo de nuevo.";

interface CopyListingStatusProps {
  copyId: string;
  listing: CopyListing;
  onChanged: () => void;
}

/** Una copia mía en el mercado: cuándo cierra, su mínimo y el botón para retirarla. */
export function CopyListingStatus({ copyId, listing, onChanged }: CopyListingStatusProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const minimum = listing.min_price === null ? "sin precio mínimo" : `mínimo ${formatMoney(listing.min_price)}`;

  async function handleUnlist() {
    setBusy(true);
    setError(null);
    try {
      await unlistCopy(copyId);
      onChanged();
    } catch (failure) {
      setError(actionErrorMessage(failure, UNLIST_ERROR));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-cta/15 px-3 py-2">
      <p className="flex-1 text-sm font-semibold">
        En venta · cierra <time dateTime={listing.closes_at}>{formatMoment(listing.closes_at)}</time> · {minimum}
      </p>
      <Button variant="outline" className="rounded-xl" disabled={busy} onClick={() => void handleUnlist()}>
        Retirar venta
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
