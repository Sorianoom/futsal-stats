"use client";

import { useState } from "react";

import { BusyDialog, type BusyControl } from "@/components/busy-dialog";
import { MillionsField } from "@/components/fantasy/millions-field";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { listCopy } from "@/lib/api/fantasy";
import type { SquadCopy } from "@/lib/api/fantasy-types";
import { actionErrorMessage } from "@/lib/fantasy/errors";
import { formatMoney } from "@/lib/fantasy/format";
import { parseMillions } from "@/lib/fantasy/market";

const NOT_AN_AMOUNT = "Escribe un importe en millones, por ejemplo 4,5, o déjalo vacío.";
const LIST_ERROR = "No se pudo poner a la venta. Comprueba la conexión e inténtalo de nuevo.";

interface FormProps extends BusyControl {
  copy: SquadCopy;
  onClose: () => void;
  onListed: () => void;
}

function ListForm({ copy, busy, setBusy, onClose, onListed }: FormProps) {
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const parsed = parseMillions(text);
    setInvalid(!parsed.ok);
    setError(null);
    if (!parsed.ok) return;
    setBusy(true);
    try {
      await listCopy(copy.copy_id, parsed.thousands);
      setBusy(false);
      onListed();
    } catch (failure) {
      setBusy(false);
      setError(actionErrorMessage(failure, LIST_ERROR));
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <p>
        La venta cierra en 24 h y gana la puja más alta. Mientras tanto sigue siendo tuyo: puedes alinearlo o
        retirar la venta.
      </p>
      <MillionsField
        id="listing-min-price"
        label="Precio mínimo (opcional)"
        value={text}
        onChange={setText}
        disabled={busy}
        hint={`Sin precio mínimo, la puja mínima es su valor: ${formatMoney(copy.value)}.`}
        error={invalid ? NOT_AN_AMOUNT : null}
      />
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="cta" disabled={busy}>
          Poner a la venta
        </Button>
      </DialogFooter>
    </form>
  );
}

interface ListCopyDialogProps {
  copy: SquadCopy | null;
  onClose: () => void;
  onListed: () => void;
}

/** Poner una copia propia en el mercado, con un precio mínimo opcional en millones. */
export function ListCopyDialog({ copy, onClose, onListed }: ListCopyDialogProps) {
  return (
    <BusyDialog open={copy !== null} title={copy ? `Vender a ${copy.name}` : "Vender"} onClose={onClose}>
      {(control) => (copy ? <ListForm key={copy.copy_id} copy={copy} {...control} onClose={onClose} onListed={onListed} /> : null)}
    </BusyDialog>
  );
}
