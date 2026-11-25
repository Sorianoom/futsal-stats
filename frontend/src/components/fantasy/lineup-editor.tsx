"use client";

import { useState } from "react";

import { FantasyPitch, SHORT_ROLE, SPOT } from "@/components/fantasy/pitch";
import { FANTASY_CARD, FANTASY_HEADING } from "@/components/fantasy/styles";
import { PlayerAvatar } from "@/components/player-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/client";
import { saveLineup } from "@/lib/api/fantasy";
import type { FantasyLineup, SquadCopy } from "@/lib/api/fantasy-types";
import { formatMoney } from "@/lib/fantasy/format";
import {
  assignSlot,
  copyIn,
  lineupSlots,
  sameLineup,
  slotOptions,
  toggleCaptain,
  type LineupSlot,
} from "@/lib/fantasy/lineup";
import { cn } from "@/lib/utils";

const EMPTY_SLOT = "Vacío";
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


interface CourtCardProps {
  label: string;
  copy: SquadCopy | null;
  captain: boolean;
  disabled: boolean;
  onOpen: () => void;
}

/** Un puesto de la pista: foto (o dorsal), capitán y nombre. Sin puntos: aquí solo se elige. */
function CourtCard({ label, copy, captain, disabled, onOpen }: CourtCardProps) {
  const name = copy ? `${label}: ${copy.name}${captain ? ", capitán" : ""}` : `${label}: vacío`;
  const spot = SPOT[label];
  return (
    <button
      type="button"
      aria-label={name}
      disabled={disabled}
      onClick={onOpen}
      style={{ left: spot.left, top: spot.top }}
      className="group absolute flex -translate-x-1/2 flex-col items-center rounded-2xl text-white outline-none focus-visible:ring-3 focus-visible:ring-gold"
    >
      <span className="relative">
        {copy ? (
          <PlayerAvatar
            name={copy.name}
            dorsal={copy.dorsal}
            photoUrl={copy.photo_url}
            className={cn(
              "size-14 border-3 text-2xl shadow-lg transition-transform group-active:scale-95",
              captain ? "border-gold" : "border-white",
            )}
          />
        ) : (
          <span className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-white/75 bg-white/10 text-3xl">
            <span aria-hidden="true">+</span>
          </span>
        )}
        {captain ? (
          <span
            aria-hidden="true"
            className="absolute -top-1 -left-2.5 grid size-5 place-items-center rounded-full border-2 border-[#0a1633] bg-gold text-[11px] font-extrabold text-[#0a1633]"
          >
            C
          </span>
        ) : null}
      </span>
      <span className="mt-1 max-w-28 truncate rounded-full bg-[#0a1633]/75 px-2 py-px text-xs font-bold">
        {copy ? copy.name.split(" ")[0] : EMPTY_SLOT}
      </span>
      <span className="text-[10px] font-extrabold tracking-widest text-white/75 uppercase">
        {SHORT_ROLE[label] ?? label}
      </span>
    </button>
  );
}

/** Una ficha grande de la hoja: foto o dorsal, nombre y valor. */
function PickCard({ copy, here, onPick }: { copy: SquadCopy; here: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      aria-label={copy.name}
      aria-current={here ? "true" : undefined}
      onClick={onPick}
      className={cn(
        "relative flex w-full flex-col gap-2 rounded-2xl border bg-muted/60 p-2.5 text-left transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/60 active:scale-95",
        here && "border-2 border-gold",
      )}
    >
      <PlayerAvatar
        name={copy.name}
        dorsal={copy.dorsal}
        photoUrl={copy.photo_url}
        className="h-24 w-full rounded-xl text-4xl"
      />
      <span className="text-base leading-tight font-extrabold">{copy.name}</span>
      <span className="flex items-center justify-between gap-2 text-xs font-bold text-muted-foreground">
        <span>{here ? "Aquí" : `Dorsal ${copy.dorsal}`}</span>
        <span>{formatMoney(copy.value)}</span>
      </span>
    </button>
  );
}

interface SlotSheetProps {
  open: { slot: LineupSlot; label: string } | null;
  squad: readonly SquadCopy[];
  lineup: FantasyLineup;
  onClose: () => void;
  onChange: (next: FantasyLineup) => void;
}

/** Hoja inferior de un hueco: fichas para elegir, capitán y dejarlo vacío. */
function SlotSheet({ open, squad, lineup, onClose, onChange }: SlotSheetProps) {
  const current = open ? copyIn(lineup, open.slot) : null;
  const currentCopy = squad.find((copy) => copy.copy_id === current) ?? null;
  const options = open ? slotOptions(squad, lineup, open.slot) : [];
  const isCaptain = current !== null && lineup.captain_copy_id === current;

  function apply(next: FantasyLineup) {
    onChange(next);
    onClose();
  }

  return (
    <Dialog open={open !== null} onOpenChange={(isOpen) => (isOpen ? null : onClose())}>
      <DialogContent className="top-auto bottom-0 flex max-h-[85dvh] max-w-full translate-y-0 flex-col overflow-hidden rounded-b-none sm:top-1/2 sm:bottom-auto sm:max-w-lg sm:-translate-y-1/2 sm:rounded-3xl">
        {open ? (
          <>
            <DialogHeader>
              <DialogTitle>{open.label}</DialogTitle>
              <DialogDescription>¿Quién juega aquí?</DialogDescription>
            </DialogHeader>
            <div className="-mx-6 min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-1 [scrollbar-width:thin]">
              {options.length === 0 ? (
                <p className="text-muted-foreground">
                  {open.slot.kind === "goalkeeper"
                    ? "No tienes ningún portero. Fíchalo en el mercado."
                    : "No te queda nadie de campo libre. Ficha en el mercado."}
                </p>
              ) : (
                <ul aria-label="Jugadores para este hueco" className="grid grid-cols-2 gap-3">
                  {options.map((copy) => (
                    <li key={copy.copy_id}>
                      <PickCard
                        copy={copy}
                        here={copy.copy_id === current}
                        onPick={() => apply(assignSlot(lineup, open.slot, copy.copy_id))}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {currentCopy ? (
              <div className="flex shrink-0 flex-col gap-2">
                <Button
                  aria-label={`Capitán: ${currentCopy.name}`}
                  aria-pressed={isCaptain}
                  className={cn(
                    "h-12 rounded-xl font-extrabold",
                    isCaptain ? "bg-muted text-foreground hover:bg-muted" : "bg-yellow-300 text-slate-900 hover:bg-yellow-400",
                  )}
                  onClick={() => apply(toggleCaptain(lineup, currentCopy.copy_id))}
                >
                  {isCaptain ? "Quitar capitán" : `Hacer capitán a ${currentCopy.name} (×2)`}
                </Button>
                <Button
                  variant="outline"
                  className="h-12 rounded-xl"
                  onClick={() => apply(assignSlot(lineup, open.slot, null))}
                >
                  Dejar vacío
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface LineupEditorProps {
  squad: readonly SquadCopy[];
  /** La alineación guardada en el servidor. */
  lineup: FantasyLineup;
  onSaved: () => void;
}

/** 1 portero y 4 de campo sobre la pista, con capitán opcional; los huecos vacíos puntúan 0. */
export function LineupEditor({ squad, lineup, onSaved }: LineupEditorProps) {
  // Cambios sin guardar; null = se enseña lo del servidor.
  const [draft, setDraft] = useState<FantasyLineup | null>(null);
  const [lastSaved, setLastSaved] = useState<FantasyLineup | null>(null);
  const [state, setState] = useState<SaveState>("idle");
  const [opened, setOpened] = useState<{ slot: LineupSlot; label: string } | null>(null);
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

  const cards = lineupSlots().map(({ slot, label }) => {
    const copyId = copyIn(shown, slot);
    return (
      <CourtCard
        key={label}
        label={label}
        copy={copyId !== null ? (byId.get(copyId) ?? null) : null}
        captain={copyId !== null && shown.captain_copy_id === copyId}
        disabled={saving}
        onOpen={() => setOpened({ slot, label })}
      />
    );
  });
  return (
    <section aria-labelledby="lineup-heading" className={`${FANTASY_CARD} space-y-3`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="lineup-heading" className={FANTASY_HEADING}>
          Alineación
        </h2>
        <p className="text-sm font-semibold text-muted-foreground">Toca un puesto para elegir jugador o capitán.</p>
      </div>
      <FantasyPitch>{cards}</FantasyPitch>
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
      <SlotSheet open={opened} squad={squad} lineup={shown} onClose={() => setOpened(null)} onChange={change} />
    </section>
  );
}
