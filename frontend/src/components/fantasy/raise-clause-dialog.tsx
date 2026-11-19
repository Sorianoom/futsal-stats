"use client";

import { useState } from "react";

import { BusyDialog, type BusyControl } from "@/components/busy-dialog";
import { MillionsField } from "@/components/fantasy/millions-field";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { raiseClause } from "@/lib/api/fantasy";
import type { SquadCopy } from "@/lib/api/fantasy-types";
import { clauseRaiseCost } from "@/lib/fantasy/clauses";
import { actionErrorMessage } from "@/lib/fantasy/errors";
import { formatMoney } from "@/lib/fantasy/format";
import { millionsInput, parseMillions } from "@/lib/fantasy/market";

const NOT_AN_AMOUNT = "Escribe un importe en millones, por ejemplo 8,5.";
const RAISE_ERROR = "No se pudo subir la cláusula. Comprueba la conexión e inténtalo de nuevo.";

function validate(text: string, current: number): { clause: number } | { invalid: string } {
  const parsed = parseMillions(text);
  if (!parsed.ok || parsed.thousands === null) return { invalid: NOT_AN_AMOUNT };
  if (parsed.thousands <= current) {
    return { invalid: `Tiene que ser mayor que la actual (${formatMoney(current)}).` };
  }
  return { clause: parsed.thousands };
}

interface FormProps extends BusyControl {
  copy: SquadCopy;
  balance: number;
  onClose: () => void;
  onDone: () => void;
}

function RaiseForm({ copy, balance, busy, setBusy, onClose, onDone }: FormProps) {
  const [text, setText] = useState(millionsInput(copy.clause));
  const [invalid, setInvalid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const typed = parseMillions(text);
  const cost = typed.ok && typed.thousands !== null ? clauseRaiseCost(copy.clause, typed.thousands) : 0;

  async function submit(clause: number) {
    setBusy(true);
    setError(null);
    try {
      await raiseClause(copy.copy_id, clause);
      setBusy(false);
      onDone();
    } catch (failure) {
      setBusy(false);
      setError(actionErrorMessage(failure, RAISE_ERROR));
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const checked = validate(text, copy.clause);
        setInvalid("invalid" in checked ? checked.invalid : null);
        if ("clause" in checked) void submit(checked.clause);
      }}
    >
      <p className="text-muted-foreground">Subirla cuesta la mitad de la subida. No se puede bajar después.</p>
      <MillionsField
        id="clause-amount"
        label="Nueva cláusula"
        value={text}
        onChange={setText}
        disabled={busy}
        hint={`Actual ${formatMoney(copy.clause)} · tu saldo ${formatMoney(balance)}`}
        error={invalid}
      />
      {cost > 0 ? <p className="font-semibold">{`Te cuesta ${formatMoney(cost)}`}</p> : null}
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
          Subir
        </Button>
      </DialogFooter>
    </form>
  );
}

interface RaiseClauseDialogProps {
  copy: SquadCopy | null;
  balance: number;
  onClose: () => void;
  onDone: () => void;
}

/** Subir la cláusula de una copia mía. El importe se teclea en millones. */
export function RaiseClauseDialog({ copy, balance, onClose, onDone }: RaiseClauseDialogProps) {
  return (
    <BusyDialog open={copy !== null} title={copy ? `Cláusula de ${copy.name}` : "Cláusula"} onClose={onClose}>
      {(control) =>
        copy ? (
          <RaiseForm key={copy.copy_id} copy={copy} balance={balance} {...control} onClose={onClose} onDone={onDone} />
        ) : null
      }
    </BusyDialog>
  );
}
