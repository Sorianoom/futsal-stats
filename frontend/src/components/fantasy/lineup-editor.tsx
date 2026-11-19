"use client";

import { useState } from "react";

import { FANTASY_CARD, FANTASY_HEADING } from "@/components/fantasy/styles";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { saveLineup } from "@/lib/api/fantasy";
import type { FantasyLineup, LastRound, SquadCopy } from "@/lib/api/fantasy-types";
import { assignSlot, copyIn, lineupSlots, sameLineup, slotOptions, toggleCaptain } from "@/lib/fantasy/lineup";
import { cn } from "@/lib/utils";

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

const GOOD_POINTS = 8;
const POOR_POINTS = 4;

function pointsTone(points: number): string {
  if (points >= GOOD_POINTS) return "bg-green-500 text-green-950";
  if (points <= POOR_POINTS) return "bg-red-400 text-red-950";
  return "bg-white text-slate-900";
}

interface SlotProps {
  id: string;
  label: string;
  copy: SquadCopy | null;
  options: readonly SquadCopy[];
  captain: boolean;
  disabled: boolean;
  onPick: (copyId: string | null) => void;
  onCaptain: () => void;
}

/** Un hueco sobre la pista: dorsal con sus puntos de la última jornada, capitán y selector. */
function CourtSlot({ id, label, copy, options, captain, disabled, onPick, onCaptain }: SlotProps) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <div className="relative">
        {copy ? (
          <span className="flex size-14 items-center justify-center rounded-full bg-white text-xl font-extrabold text-slate-900 tabular-nums shadow-lg">
            {copy.dorsal}
          </span>
        ) : (
          <span className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-white/70 text-2xl text-white">
            +
          </span>
        )}
        {copy && copy.last_points !== null ? (
          <span
            aria-label={`${copy.name}: ${copy.last_points} puntos en la última jornada`}
            className={cn(
              "absolute -top-2 -right-4 flex h-7 min-w-8 items-center justify-center rounded-full border-2 border-[#1D3B8F] px-1.5 text-sm font-extrabold tabular-nums",
              pointsTone(copy.last_points),
            )}
          >
            {copy.last_points}
          </span>
        ) : null}
        {copy ? (
          <button
            type="button"
            aria-label={`Capitán: ${copy.name}`}
            aria-pressed={captain}
            disabled={disabled}
            onClick={onCaptain}
            className={cn(
              "absolute -top-2 -left-4 flex size-7 items-center justify-center rounded-full border-2 border-[#1D3B8F] text-xs font-extrabold focus-visible:ring-3 focus-visible:ring-white/70 focus-visible:outline-none",
              captain ? "bg-yellow-400 text-slate-900" : "bg-white/20 text-white",
            )}
          >
            C
          </button>
        ) : null}
      </div>
      <span className="max-w-full truncate rounded-lg bg-slate-900/85 px-2 py-0.5 text-xs font-extrabold text-white">
        {copy ? copy.name : EMPTY_SLOT}
      </span>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={copy?.copy_id ?? ""}
        disabled={disabled}
        onChange={(event) => onPick(event.target.value || null)}
        className="block min-h-11 w-full max-w-44 rounded-xl border border-white/30 bg-white/10 px-2 text-sm font-semibold text-white [&>option]:text-slate-900"
      >
        <option value="">{EMPTY}</option>
        {options.map((option) => (
          <option key={option.copy_id} value={option.copy_id}>
            {`${option.dorsal} · ${option.name}`}
          </option>
        ))}
      </select>
    </div>
  );
}

interface LineupEditorProps {
  squad: readonly SquadCopy[];
  /** La alineación guardada en el servidor. */
  lineup: FantasyLineup;
  lastRound: LastRound | null;
  onSaved: () => void;
}

/** 1 portero y 4 de campo sobre la pista, con capitán opcional; los huecos vacíos puntúan 0. */
export function LineupEditor({ squad, lineup, lastRound, onSaved }: LineupEditorProps) {
  // Cambios sin guardar; null = se enseña lo del servidor.
  const [draft, setDraft] = useState<FantasyLineup | null>(null);
  const [lastSaved, setLastSaved] = useState<FantasyLineup | null>(null);
  const [state, setState] = useState<SaveState>("idle");
  const shown = draft ?? lineup;
  const alreadySaved = lastSaved !== null && sameLineup(shown, lastSaved);
  const dirty = !sameLineup(shown, lineup) && !alreadySaved;
  const saving = state === "saving";
  const byId = new Map(squad.map((copy) => [copy.copy_id, copy]));

  function change(next: FantasyLineup) {
    setDraft(next);
    setState("idle");
  }

  async function handleSave() {
    setState("saving");
    try {
      const saved = await saveLineup(shown);
      setDraft(saved);
      setLastSaved(saved);
      setState("saved");
      onSaved();
    } catch (failure) {
      setState({ error: errorMessage(failure) });
    }
  }

  const slots = lineupSlots().map(({ slot, label }) => {
    const id = slot.kind === "goalkeeper" ? "slot-goalkeeper" : `slot-field-${slot.index}`;
    const copyId = copyIn(shown, slot);
    return (
      <CourtSlot
        key={id}
        id={id}
        label={label}
        copy={copyId !== null ? (byId.get(copyId) ?? null) : null}
        options={slotOptions(squad, shown, slot)}
        captain={copyId !== null && shown.captain_copy_id === copyId}
        disabled={saving}
        onPick={(picked) => change(assignSlot(shown, slot, picked))}
        onCaptain={() => copyId !== null && change(toggleCaptain(shown, copyId))}
      />
    );
  });
  const [goalkeeper, ...field] = slots;

  return (
    <section aria-labelledby="lineup-heading" className={`${FANTASY_CARD} space-y-3`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="lineup-heading" className={FANTASY_HEADING}>
          Alineación
        </h2>
        <p className="text-sm font-semibold text-muted-foreground">Toca la C para elegir capitán: puntúa doble.</p>
      </div>
      {lastRound ? (
        <p className="text-sm font-semibold text-muted-foreground">{`Puntos de la última jornada, vs ${lastRound.opponent}`}</p>
      ) : null}
      <div className="relative overflow-hidden rounded-2xl bg-[#1D3B8F] px-3 pt-6 pb-4">
        <div aria-hidden="true" className="pointer-events-none absolute inset-3 rounded-xl border-2 border-white/25" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-12 left-1/2 size-28 -translate-x-1/2 rounded-full border-2 border-white/25"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-20 left-1/2 h-36 w-52 -translate-x-1/2 rounded-full border-2 border-white/25"
        />
        <div className="relative grid grid-cols-2 gap-x-3 gap-y-5">
          {field}
          <div className="col-span-2 flex justify-center">{goalkeeper}</div>
        </div>
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
