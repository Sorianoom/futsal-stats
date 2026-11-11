"use client";

import { useState } from "react";

import { FANTASY_CARD, FANTASY_HEADING } from "@/components/fantasy/styles";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { saveLineup } from "@/lib/api/fantasy";
import type { FantasyLineup, SquadCopy } from "@/lib/api/fantasy-types";
import { assignSlot, copyIn, lineupSlots, sameLineup, slotOptions } from "@/lib/fantasy/lineup";

const EMPTY = "Vacío";
const EMPTY_SLOT = "Vacío · 0 puntos";
const INVALID_LINEUP =
  "La alineación no es válida: el portero tiene que ser portero, los de campo, de campo, y sin repetir a nadie.";
const SAVE_ERROR = "No se pudo guardar la alineación. Comprueba la conexión e inténtalo de nuevo.";
const SERVER_ERROR_FROM = 500;

type SaveState = "idle" | "saving" | "saved" | { error: string };

function errorMessage(failure: unknown): string {
  if (!(failure instanceof ApiError)) return SAVE_ERROR;
  if (failure.code === "invalid_lineup") return INVALID_LINEUP;
  const clientError = failure.status >= 400 && failure.status < SERVER_ERROR_FROM;
  return clientError ? failure.message : SAVE_ERROR;
}

interface LineupEditorProps {
  squad: readonly SquadCopy[];
  /** La alineación guardada en el servidor. */
  lineup: FantasyLineup;
  nextMatchId: string | null;
  onSaved: () => void;
}

/** 1 portero y 4 de campo de la propia plantilla; los huecos vacíos se permiten y puntúan 0. */
export function LineupEditor({ squad, lineup, nextMatchId, onSaved }: LineupEditorProps) {
  // Cambios sin guardar; null = se enseña lo del servidor.
  const [draft, setDraft] = useState<FantasyLineup | null>(null);
  const [lastSaved, setLastSaved] = useState<FantasyLineup | null>(null);
  const [state, setState] = useState<SaveState>("idle");
  const shown = draft ?? lineup;
  const alreadySaved = lastSaved !== null && sameLineup(shown, lastSaved);
  const dirty = !sameLineup(shown, lineup) && !alreadySaved;
  const saving = state === "saving";

  function change(next: FantasyLineup) {
    setDraft(next);
    setState("idle");
  }

  async function handleSave() {
    setState("saving");
    try {
      const saved = await saveLineup(shown, nextMatchId);
      setDraft(saved);
      setLastSaved(saved);
      setState("saved");
      onSaved();
    } catch (failure) {
      setState({ error: errorMessage(failure) });
    }
  }

  return (
    <section aria-labelledby="lineup-heading" className={`${FANTASY_CARD} space-y-4`}>
      <h2 id="lineup-heading" className={FANTASY_HEADING}>
        Alineación
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {lineupSlots().map(({ slot, label }) => {
          const id = slot.kind === "goalkeeper" ? "slot-goalkeeper" : `slot-field-${slot.index}`;
          const value = copyIn(shown, slot);
          return (
            <div key={id} className={slot.kind === "goalkeeper" ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
              <label htmlFor={id} className="text-sm font-bold">
                {label}
              </label>
              <select
                id={id}
                value={value ?? ""}
                disabled={saving}
                onChange={(event) => change(assignSlot(shown, slot, event.target.value || null))}
                className="block min-h-12 w-full rounded-2xl border-2 bg-background px-3 text-base font-semibold"
              >
                <option value="">{EMPTY}</option>
                {slotOptions(squad, shown, slot).map((copy) => (
                  <option key={copy.copy_id} value={copy.copy_id}>
                    {`${copy.dorsal} · ${copy.name}`}
                  </option>
                ))}
              </select>
              {value === null ? <p className="text-sm text-muted-foreground">{EMPTY_SLOT}</p> : null}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          variant="cta"
          className="rounded-2xl"
          disabled={!dirty || saving}
          onClick={() => void handleSave()}
        >
          Guardar alineación
        </Button>
        {saving ? <p className="text-muted-foreground">Guardando…</p> : null}
        {state === "saved" ? (
          <p role="status" className="font-semibold text-primary">
            Alineación guardada
          </p>
        ) : null}
        {typeof state === "object" ? (
          <p role="alert" className="text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
