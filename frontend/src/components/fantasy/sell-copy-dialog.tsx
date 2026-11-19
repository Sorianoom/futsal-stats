"use client";

import { useState } from "react";

import { BusyDialog, type BusyControl } from "@/components/busy-dialog";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { sellToBank } from "@/lib/api/fantasy";
import type { BankSale, SquadCopy } from "@/lib/api/fantasy-types";
import { actionErrorMessage } from "@/lib/fantasy/errors";
import { formatMoney } from "@/lib/fantasy/format";
import { bankSalePrice } from "@/lib/fantasy/market";

const SELL_ERROR = "No se pudo vender. Comprueba la conexión e inténtalo de nuevo.";

interface ConfirmProps extends BusyControl {
  copy: SquadCopy;
  onClose: () => void;
  onSold: (sale: BankSale) => void;
}

function ConfirmSale({ copy, busy, setBusy, onClose, onSold }: ConfirmProps) {
  const [error, setError] = useState<string | null>(null);
  const price = formatMoney(bankSalePrice(copy.value));

  async function handleSell() {
    setBusy(true);
    setError(null);
    try {
      const sale = await sellToBank(copy.copy_id);
      setBusy(false);
      onSold(sale);
    } catch (failure) {
      setBusy(false);
      setError(actionErrorMessage(failure, SELL_ERROR));
    }
  }

  return (
    <div className="space-y-4">
      <p>
        La banca te paga el 70 % de su valor ({formatMoney(copy.value)}): <strong>{price}</strong>. Es inmediato y
        no se puede deshacer.
      </p>
      {copy.listing ? <p className="text-muted-foreground">Se anulará su venta en el mercado y sus pujas.</p> : null}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" variant="cta" disabled={busy} onClick={() => void handleSell()}>
          {`Vender por ${price}`}
        </Button>
      </DialogFooter>
    </div>
  );
}

interface SellCopyDialogProps {
  copy: SquadCopy | null;
  onClose: () => void;
  /** Recibe lo que devuelve la API: el precio cobrado de verdad (el valor pudo cambiar entre medias). */
  onSold: (sale: BankSale) => void;
}

/** Confirmación de la venta inmediata a la banca, con el importe que se cobra. */
export function SellCopyDialog({ copy, onClose, onSold }: SellCopyDialogProps) {
  return (
    <BusyDialog
      open={copy !== null}
      title={copy ? `Vender a ${copy.name} a la banca` : "Vender a la banca"}
      onClose={onClose}
    >
      {(control) => (copy ? <ConfirmSale key={copy.copy_id} copy={copy} {...control} onClose={onClose} onSold={onSold} /> : null)}
    </BusyDialog>
  );
}
