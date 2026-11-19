"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { SquadCopy } from "@/lib/api/fantasy-types";
import { formatMoney } from "@/lib/fantasy/format";
import { POSITION_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** Lo que tarda el sobre en temblar y romperse antes de enseñar la carta. */
const REVEAL_DELAY_MS = 900;

export function packsSeenKey(participantId: string): string {
  return `futsal:fantasy:packs-seen:${participantId}`;
}

function alreadySeen(participantId: string): boolean {
  try {
    return window.localStorage.getItem(packsSeenKey(participantId)) !== null;
  } catch {
    return false;
  }
}

function markSeen(participantId: string): void {
  try {
    window.localStorage.setItem(packsSeenKey(participantId), new Date().toISOString());
  } catch {
    // Sin almacenamiento (modo privado): los sobres volverían a salir la próxima vez.
  }
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Phase = "sealed" | "opening" | "revealed";

function Pack({ number, total, opening }: { number: number; total: number; opening: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative mx-auto flex h-80 w-56 flex-col items-center justify-between overflow-hidden rounded-3xl bg-[#1D3B8F] p-5 text-white shadow-2xl ring-2 ring-white/20",
        opening && "pack-opening",
      )}
    >
      <span className="absolute inset-x-0 top-1/2 h-16 -translate-y-1/2 -skew-y-12 bg-cta" />
      <span className="absolute inset-x-0 top-1/2 mt-12 h-3 -translate-y-1/2 -skew-y-12 bg-white/80" />
      <span className="relative text-xs font-extrabold tracking-[0.3em] uppercase">Fantasy</span>
      <span className="relative flex size-20 items-center justify-center rounded-2xl bg-white text-3xl font-extrabold text-[#1D3B8F] shadow-lg">
        FS
      </span>
      <span className="relative text-sm font-bold">{`Sobre ${number} de ${total}`}</span>
    </div>
  );
}

function PlayerCard({ copy }: { copy: SquadCopy }) {
  return (
    <div
      role="group"
      aria-label={copy.name}
      className="pack-card relative mx-auto flex h-80 w-56 flex-col overflow-hidden rounded-3xl bg-white text-slate-900 shadow-2xl ring-4 ring-cta"
    >
      <div className="flex items-start justify-between bg-cta px-4 pt-4 pb-10">
        <span className="text-6xl leading-none font-extrabold tabular-nums">{copy.dorsal}</span>
        <span className="rounded-full bg-slate-900/85 px-2.5 py-1 text-xs font-extrabold text-white uppercase">
          {POSITION_LABEL[copy.position]}
        </span>
      </div>
      <div className="-mt-6 mx-3 flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl bg-white px-3 pb-4 text-center">
        <span className="text-2xl leading-tight font-extrabold">{copy.name}</span>
        <dl className="grid w-full grid-cols-2 gap-2 text-left">
          <div className="rounded-xl bg-slate-100 px-2.5 py-1.5">
            <dt className="text-[10px] font-extrabold tracking-wider text-slate-500 uppercase">Valor</dt>
            <dd className="font-extrabold tabular-nums">{formatMoney(copy.value)}</dd>
          </div>
          <div className="rounded-xl bg-slate-100 px-2.5 py-1.5">
            <dt className="text-[10px] font-extrabold tracking-wider text-slate-500 uppercase">Cláusula</dt>
            <dd className="font-extrabold tabular-nums">{formatMoney(copy.clause)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

interface PackOpeningProps {
  participantId: string;
  /** Un sobre por copia, en este orden. */
  squad: readonly SquadCopy[];
  revealDelayMs?: number;
}

/**
 * Bienvenida al Fantasy: un sobre por jugador recibido, que se abre de uno en uno. Sale una vez
 * por participante en cada dispositivo (se recuerda en localStorage).
 */
export function PackOpening({ participantId, squad, revealDelayMs = REVEAL_DELAY_MS }: PackOpeningProps) {
  const [open, setOpen] = useState(() => squad.length > 0 && !alreadySeen(participantId));
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("sealed");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!open || squad.length === 0) return null;
  const total = squad.length;
  const current = squad[Math.min(index, total - 1)];
  const last = index >= total - 1;

  function finish() {
    markSeen(participantId);
    setOpen(false);
  }

  function openPack() {
    const delay = prefersReducedMotion() ? 0 : revealDelayMs;
    setPhase("opening");
    timer.current = setTimeout(() => setPhase("revealed"), delay);
  }

  function nextPack() {
    setIndex((value) => value + 1);
    setPhase("sealed");
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : finish())}>
      <DialogContent
        showCloseButton={false}
        className="max-w-sm gap-6 bg-foreground p-6 text-background ring-white/10 sm:max-w-sm"
      >
        <div className="space-y-1 text-center">
          <DialogTitle className="text-2xl font-extrabold">Tus sobres</DialogTitle>
          <DialogDescription className="text-slate-300">
            {total === 1 ? "Tienes 1 sobre" : `Tienes ${total} sobres`} con los jugadores de tu equipo.
          </DialogDescription>
        </div>
        <div className="relative flex min-h-80 items-center justify-center">
          {phase === "revealed" ? (
            <>
              <span aria-hidden="true" className="pack-flash absolute inset-0 m-auto size-72 rounded-full bg-cta/40 blur-2xl" />
              <PlayerCard copy={current} />
            </>
          ) : (
            <Pack number={index + 1} total={total} opening={phase === "opening"} />
          )}
        </div>
        <div className="flex flex-col gap-2">
          {phase !== "revealed" ? (
            <Button
              size="lg"
              variant="cta"
              className="rounded-2xl"
              disabled={phase === "opening"}
              onClick={openPack}
            >
              Abrir sobre
            </Button>
          ) : last ? (
            <Button size="lg" variant="cta" className="rounded-2xl" onClick={finish}>
              Ver mi equipo
            </Button>
          ) : (
            <Button size="lg" variant="cta" className="rounded-2xl" onClick={nextPack}>
              Siguiente sobre
            </Button>
          )}
          <Button variant="ghost" className="rounded-2xl text-slate-300 hover:text-white" onClick={finish}>
            Saltar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
