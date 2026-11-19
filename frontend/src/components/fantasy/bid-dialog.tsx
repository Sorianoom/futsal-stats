"use client";

import { useState } from "react";

import { BusyDialog, type BusyControl } from "@/components/busy-dialog";
import { MillionsField } from "@/components/fantasy/millions-field";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { placeBid, withdrawBid } from "@/lib/api/fantasy";
import type { MarketListing } from "@/lib/api/fantasy-types";
import { actionErrorMessage } from "@/lib/fantasy/errors";
import { formatMoney } from "@/lib/fantasy/format";
import { millionsInput, parseMillions } from "@/lib/fantasy/market";

const NOT_AN_AMOUNT = "Escribe un importe en millones, por ejemplo 4,5.";
const BID_ERROR = "No se pudo guardar la puja. Comprueba la conexión e inténtalo de nuevo.";
const WITHDRAW_ERROR = "No se pudo retirar la puja. Comprueba la conexión e inténtalo de nuevo.";

/** La cantidad tecleada, o el motivo por el que no vale. */
function validate(text: string, minBid: number): { amount: number } | { invalid: string } {
  const parsed = parseMillions(text);
  if (!parsed.ok || parsed.thousands === null) return { invalid: NOT_AN_AMOUNT };
  if (parsed.thousands < minBid) return { invalid: `La puja mínima es ${formatMoney(minBid)}.` };
  return { amount: parsed.thousands };
}

interface FormProps extends BusyControl {
  listing: MarketListing;
  balance: number;
  onClose: () => void;
  onDone: () => void;
}

function BidForm({ listing, balance, busy, setBusy, onClose, onDone }: FormProps) {
  const [text, setText] = useState(millionsInput(listing.my_bid ?? listing.min_bid));
  const [invalid, setInvalid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setBusy(false);
      onDone();
    } catch (failure) {
      setBusy(false);
      setError(actionErrorMessage(failure, fallback));
    }
  }

  function handleSubmit() {
    const checked = validate(text, listing.min_bid);
    setInvalid("invalid" in checked ? checked.invalid : null);
    if ("amount" in checked) void run(() => placeBid(listing.listing_id, checked.amount), BID_ERROR);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
      <p className="text-muted-foreground">
        Sobre cerrado: nadie ve tu puja. Al cierre gana la más alta y, si empatan, la más antigua.
      </p>
      <MillionsField
        id="bid-amount"
        label="Tu puja"
        value={text}
        onChange={setText}
        disabled={busy}
        hint={`Mínimo ${formatMoney(listing.min_bid)} · tu saldo ${formatMoney(balance)}`}
        error={invalid}
      />
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter className="gap-2">
        {listing.my_bid !== null ? (
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => void run(() => withdrawBid(listing.listing_id), WITHDRAW_ERROR)}
          >
            Retirar puja
          </Button>
        ) : null}
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="cta" disabled={busy}>
          Guardar puja
        </Button>
      </DialogFooter>
    </form>
  );
}

interface BidDialogProps {
  listing: MarketListing | null;
  balance: number;
  onClose: () => void;
  onDone: () => void;
}

/** Pujar, cambiar la puja o retirarla. La cantidad se teclea en millones. */
export function BidDialog({ listing, balance, onClose, onDone }: BidDialogProps) {
  return (
    <BusyDialog open={listing !== null} title={listing ? `Puja por ${listing.name}` : "Puja"} onClose={onClose}>
      {(control) =>
        listing ? (
          <BidForm key={listing.listing_id} listing={listing} balance={balance} {...control} onClose={onClose} onDone={onDone} />
        ) : null
      }
    </BusyDialog>
  );
}
