"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Player } from "@/lib/api/types";
import {
  LineupError,
  applySubstitutions,
  type LineupState,
  type SubstitutionPair,
} from "@/lib/match/lineup";
import { cn } from "@/lib/utils";

export interface MultiSubstitutionStart {
  side: "court" | "bench";
  playerId: string;
}

interface MultiSubstitutionDialogProps {
  open: boolean;
  /** Alineación actual: con ella se validan los cambios antes de anotarlos. */
  state: LineupState;
  /** Tiempo (segundos jugados) con el que se abre: el del reloj. Se puede corregir. */
  t: number;
  /** Límites del tiempo corregido: el último movimiento de la alineación y la duración de la parte. */
  minT: number;
  maxT: number;
  /** El tiempo tal y como se ve en el marcador. */
  formatTime: (t: number) => string;
  court: readonly Player[];
  bench: readonly Player[];
  /** Jugador con el que se abrió (ya elegido). */
  initial: MultiSubstitutionStart | null;
  onConfirm: (pairs: SubstitutionPair[], t: number) => void;
  onClose: () => void;
}

/**
 * Varios cambios a la vez: se toca quién sale y quién entra (en cualquier orden) para formar cada
 * par, y todos se anotan con el mismo tiempo.
 */
export function MultiSubstitutionDialog(props: MultiSubstitutionDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={(next) => (next ? undefined : props.onClose())}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Cambios</DialogTitle>
          <DialogDescription>Toca quién sale y quién entra. Todos se anotan con el mismo tiempo</DialogDescription>
        </DialogHeader>
        {props.open ? <Pairs {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function plural(count: number): string {
  return count === 1 ? "1 cambio" : `${count} cambios`;
}

const TIME_STEPS = [
  { delta: -10, label: "10 segundos antes", text: "−10 s" },
  { delta: -1, label: "1 segundo antes", text: "−1 s" },
  { delta: 1, label: "1 segundo después", text: "+1 s" },
  { delta: 10, label: "10 segundos después", text: "+10 s" },
] as const;

function Pairs(props: MultiSubstitutionDialogProps) {
  const { state, minT, maxT, formatTime, court, bench, initial, onConfirm, onClose } = props;
  const [t, setT] = useState(props.t);
  const timeText = formatTime(t);
  const [pairs, setPairs] = useState<SubstitutionPair[]>([]);
  const [out, setOut] = useState<string | null>(initial?.side === "court" ? initial.playerId : null);
  const [entering, setEntering] = useState<string | null>(initial?.side === "bench" ? initial.playerId : null);
  const [error, setError] = useState<string | null>(null);

  const paired = new Set(pairs.flatMap((pair) => [pair.out, pair.in]));
  const nameOf = (id: string) => [...court, ...bench].find((p) => p.id === id)?.name ?? id;

  function pick(side: "court" | "bench", playerId: string) {
    setError(null);
    const nextOut = side === "court" ? (out === playerId ? null : playerId) : out;
    const nextIn = side === "bench" ? (entering === playerId ? null : playerId) : entering;
    if (nextOut !== null && nextIn !== null) {
      setPairs((current) => [...current, { out: nextOut, in: nextIn }]);
      setOut(null);
      setEntering(null);
      return;
    }
    setOut(nextOut);
    setEntering(nextIn);
  }

  function confirm() {
    try {
      applySubstitutions(state, t, pairs);
    } catch (failure) {
      if (!(failure instanceof LineupError)) throw failure;
      setError(failure.message);
      return;
    }
    onConfirm(pairs, t);
  }

  const column = (side: "court" | "bench", players: readonly Player[]) => {
    const selected = side === "court" ? out : entering;
    const verb = side === "court" ? "Sale" : "Entra";
    return (
      <div className="space-y-2">
        <p className="font-semibold">{side === "court" ? "Salen (pista)" : "Entran (banquillo)"}</p>
        {players.map((player) => (
          <Button
            key={player.id}
            variant={selected === player.id ? "default" : "outline"}
            size="lg"
            className={cn("h-14 w-full justify-start text-lg", paired.has(player.id) && "opacity-40")}
            disabled={paired.has(player.id)}
            aria-pressed={selected === player.id}
            aria-label={`${verb} ${player.dorsal} · ${player.name}`}
            onClick={() => pick(side, player.id)}
          >
            {player.dorsal} · {player.name}
          </Button>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {column("court", court)}
        {column("bench", bench)}
      </div>
      {pairs.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {pairs.map((pair) => (
            <Button
              key={pair.out}
              variant="secondary"
              aria-label={`Quitar: entra ${nameOf(pair.in)}, sale ${nameOf(pair.out)}`}
              onClick={() => setPairs((current) => current.filter((p) => p !== pair))}
            >
              {`Entra ${nameOf(pair.in)} · sale ${nameOf(pair.out)} ✕`}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2 rounded-lg border p-2">
        <span className="text-lg font-semibold tabular-nums">{`Tiempo: ${timeText}`}</span>
        <div className="flex gap-2">
          {TIME_STEPS.map((step) => (
            <Button
              key={step.delta}
              variant="outline"
              size="lg"
              className="h-12 min-w-14"
              aria-label={step.label}
              onClick={() => setT((current) => Math.min(maxT, Math.max(minT, current + step.delta)))}
            >
              {step.text}
            </Button>
          ))}
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" size="lg" className="h-14" onClick={onClose}>
          Cancelar
        </Button>
        <Button size="lg" className="h-14 text-lg" disabled={pairs.length === 0} onClick={confirm}>
          {pairs.length === 0 ? "Anotar cambios" : `Anotar ${plural(pairs.length)} en ${timeText}`}
        </Button>
      </div>
    </div>
  );
}
