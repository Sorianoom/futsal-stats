"use client";

import { useState } from "react";

import { FANTASY_CARD, FANTASY_HEADING } from "@/components/fantasy/styles";
import { PlayerAvatar } from "@/components/player-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/client";
import { saveLineup } from "@/lib/api/fantasy";
import type { FantasyLineup, LastRound, SquadCopy } from "@/lib/api/fantasy-types";
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

/** Color de la ficha según sus puntos de la última jornada: buena, normal o floja. */
function cardTone(points: number | null): string {
  if (points !== null && points >= GOOD_POINTS) return "bg-linear-to-br from-orange-300 via-cta to-orange-600 text-stone-900";
  if (points !== null && points <= POOR_POINTS) return "bg-linear-to-br from-slate-200 to-slate-300 text-slate-900";
  return "bg-linear-to-br from-white to-blue-100 text-slate-900";
}

function pointsTone(points: number): string {
  if (points >= GOOD_POINTS) return "bg-green-600 text-white";
  if (points <= POOR_POINTS) return "bg-red-600 text-white";
  return "bg-slate-900 text-white";
}

interface CourtCardProps {
  label: string;
  copy: SquadCopy | null;
  captain: boolean;
  disabled: boolean;
  onOpen: () => void;
}

/** Un hueco de la pista: la ficha del jugador (o un hueco vacío). Al tocarlo se abre la hoja. */
function CourtCard({ label, copy, captain, disabled, onOpen }: CourtCardProps) {
  const name = copy ? `${label}: ${copy.name}${captain ? ", capitán" : ""}` : `${label}: vacío`;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        aria-label={name}
        disabled={disabled}
        onClick={onOpen}
        className={cn(
          "relative flex h-32 w-24 flex-col items-center justify-center gap-1 rounded-2xl p-2 shadow-lg transition-transform outline-none focus-visible:ring-3 focus-visible:ring-white/80 active:scale-95",
          copy ? cardTone(copy.last_points) : "border-2 border-dashed border-white/70 text-white shadow-none",
          captain && "ring-3 ring-yellow-300 ring-offset-2 ring-offset-[#1D3B8F]",
        )}
      >
        {copy ? (
          <>
            {captain ? (
              <span className="absolute top-1.5 left-1.5 rounded-full bg-yellow-300 px-1.5 text-[11px] font-extrabold text-slate-900">
                C ×2
              </span>
            ) : null}
            {copy.last_points !== null ? (
              <span
                aria-label={`${copy.name}: ${copy.last_points} puntos en la última jornada`}
                className={cn(
                  "absolute top-1.5 right-1.5 rounded-full px-1.5 text-[11px] font-extrabold tabular-nums",
                  pointsTone(copy.last_points),
                )}
              >
                {copy.last_points}
              </span>
            ) : null}
            <PlayerAvatar
              name={copy.name}
              dorsal={copy.dorsal}
              photoUrl={copy.photo_url}
              className="mt-3 size-14 bg-white/70 text-2xl text-slate-900"
            />
            <span className="w-full truncate text-center text-xs font-extrabold">{copy.name}</span>
          </>
        ) : (
          <>
            <span aria-hidden="true" className="text-3xl leading-none">
              +
            </span>
            <span className="text-xs font-extrabold">{label}</span>
          </>
        )}
      </button>
      {copy ? null : (
        <span className="rounded-lg bg-slate-900/85 px-2 py-0.5 text-xs font-extrabold text-white">{EMPTY_SLOT}</span>
      )}
    </div>
  );
}

/** Una ficha grande de la hoja: foto o dorsal, puntos de la última jornada, nombre y valor. */
function PickCard({ copy, here, onPick }: { copy: SquadCopy; here: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      aria-label={copy.name}
      aria-current={here ? "true" : undefined}
      onClick={onPick}
      className={cn(
        "flex min-h-36 w-full flex-col gap-2 rounded-2xl p-3 text-left shadow-md transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/60 active:scale-95",
        cardTone(copy.last_points),
        here ? "ring-3 ring-slate-900" : "ring-1 ring-slate-900/10",
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <PlayerAvatar
          name={copy.name}
          dorsal={copy.dorsal}
          photoUrl={copy.photo_url}
          className="size-14 bg-white/70 text-2xl text-slate-900"
        />
        {copy.last_points !== null ? (
          <span className="flex flex-col items-end leading-none">
            <span className="text-2xl font-extrabold tabular-nums">{copy.last_points}</span>
            <span className="text-[10px] font-extrabold tracking-widest uppercase opacity-75">puntos</span>
          </span>
        ) : null}
      </span>
      <span className="text-base leading-tight font-extrabold">{copy.name}</span>
      <span className="mt-auto flex justify-between text-xs font-bold opacity-80">
        <span>{`Dorsal ${copy.dorsal}`}</span>
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
  lastRound: LastRound | null;
  onSaved: () => void;
}

/** 1 portero y 4 de campo sobre la pista, con capitán opcional; los huecos vacíos puntúan 0. */
export function LineupEditor({ squad, lineup, lastRound, onSaved }: LineupEditorProps) {
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
  const [goalkeeper, ...field] = cards;

  return (
    <section aria-labelledby="lineup-heading" className={`${FANTASY_CARD} space-y-3`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="lineup-heading" className={FANTASY_HEADING}>
          Alineación
        </h2>
        <p className="text-sm font-semibold text-muted-foreground">Toca un hueco para elegir jugador o capitán.</p>
      </div>
      {lastRound ? (
        <p className="text-sm font-semibold text-muted-foreground">{`Puntos de la última jornada, vs ${lastRound.opponent}`}</p>
      ) : null}
      <div className="relative overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_50%_45%,#2563eb,#1D3B8F_75%)] px-3 pt-6 pb-5">
        <div aria-hidden="true" className="pointer-events-none absolute inset-3 rounded-2xl border-2 border-white/20" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-3 top-[46%] border-t-2 border-white/20" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-[46%] left-1/2 size-24 -translate-1/2 rounded-full border-2 border-white/20"
        />
        <div className="relative mx-auto grid max-w-80 grid-cols-2 justify-items-center gap-x-3 gap-y-5">
          {field}
          <div className="col-span-2">{goalkeeper}</div>
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
      <SlotSheet open={opened} squad={squad} lineup={shown} onClose={() => setOpened(null)} onChange={change} />
    </section>
  );
}
