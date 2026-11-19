"use client";

import { useState } from "react";

import { BusyDialog, type BusyControl } from "@/components/busy-dialog";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { buyClause } from "@/lib/api/fantasy";
import type { BankSale, ClauseCopy } from "@/lib/api/fantasy-types";
import { actionErrorMessage } from "@/lib/fantasy/errors";
import { formatMoney } from "@/lib/fantasy/format";

const BUY_ERROR = "No se pudo clausular. Comprueba la conexión e inténtalo de nuevo.";

interface ConfirmProps extends BusyControl {
  copy: ClauseCopy;
  balance: number;
  onClose: () => void;
  onBought: (purchase: BankSale) => void;
}

function ConfirmBuy({ copy, balance, busy, setBusy, onClose, onBought }: ConfirmProps) {
  const [error, setError] = useState<string | null>(null);
  const price = formatMoney(copy.clause);

  async function handleBuy() {
    setBusy(true);
    setError(null);
    try {
      const purchase = await buyClause(copy.copy_id);
      setBusy(false);
      onBought(purchase);
    } catch (failure) {
      setBusy(false);
      setError(actionErrorMessage(failure, BUY_ERROR));
    }
  }

  return (
    <div className="space-y-4">
      <p>
        Pagas su cláusula, <strong>{price}</strong>, a {copy.owner.display_name} y {copy.name} pasa a tu plantilla al
        momento. No se puede deshacer.
      </p>
      <p className="text-muted-foreground">{`Tu saldo: ${formatMoney(balance)}.`}</p>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" variant="cta" disabled={busy} onClick={() => void handleBuy()}>
          {`Pagar ${price}`}
        </Button>
      </DialogFooter>
    </div>
  );
}

interface BuyClauseDialogProps {
  copy: ClauseCopy | null;
  balance: number;
  onClose: () => void;
  onBought: (purchase: BankSale) => void;
}

/** Confirmación del clausulazo, con el precio que se paga. */
export function BuyClauseDialog({ copy, balance, onClose, onBought }: BuyClauseDialogProps) {
  return (
    <BusyDialog open={copy !== null} title={copy ? `Clausular a ${copy.name}` : "Clausular"} onClose={onClose}>
      {(control) =>
        copy ? (
          <ConfirmBuy key={copy.copy_id} copy={copy} balance={balance} {...control} onClose={onClose} onBought={onBought} />
        ) : null
      }
    </BusyDialog>
  );
}
