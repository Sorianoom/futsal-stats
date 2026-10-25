"use client";

import { useState } from "react";

import { KeypadBody } from "@/components/time-keypad";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { elapsedToDisplay, formatClock, shiftDisplay, type ClockSettings } from "@/lib/match/clock";

const ADJUSTMENTS = [
  { label: "−1 min", delta: -60 },
  { label: "−20 s", delta: -20 },
  { label: "+20 s", delta: 20 },
  { label: "+1 min", delta: 60 },
];

type Mode = "end" | "adjust" | "keypad";

interface BodyProps {
  settings: ClockSettings;
  suggested: number;
  minElapsed?: number;
  endOfPart?: boolean;
  onConfirm: (elapsed: number) => void;
  onCancel: () => void;
}

function Body({ settings, suggested, minElapsed, endOfPart = false, onConfirm, onCancel }: BodyProps) {
  const [mode, setMode] = useState<Mode>(endOfPart ? "end" : "adjust");
  const [elapsed, setElapsed] = useState(endOfPart ? settings.partSeconds : suggested);
  const floor = minElapsed ?? 0;
  // Al empezar la parte el mínimo es 0 y aún no hay "último movimiento" que mencionar.
  const atFloor = floor > 0 && elapsed === floor;

  if (mode === "keypad") {
    return (
      <KeypadBody
        settings={settings}
        initialElapsed={elapsed}
        minElapsed={minElapsed}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
  }

  if (mode === "end") {
    const finalClock = formatClock(elapsedToDisplay(settings.partSeconds, settings));
    return (
      <div className="space-y-3">
        <Button
          variant="cta"
          size="lg"
          className="h-20 w-full rounded-2xl text-xl"
          onClick={() => onConfirm(settings.partSeconds)}
        >
          {`Terminó en ${finalClock}`}
        </Button>
        <Button variant="outline" size="lg" className="w-full rounded-2xl" onClick={() => setMode("adjust")}>
          Otro tiempo
        </Button>
        <Button variant="ghost" className="w-full" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1 text-center">
        <p role="status" className="text-7xl font-extrabold tabular-nums">
          {formatClock(elapsedToDisplay(elapsed, settings))}
        </p>
        <p className="text-sm text-muted-foreground">Tiempo estimado: ajústalo a lo que marca el marcador</p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {ADJUSTMENTS.map(({ label, delta }) => (
          <Button
            key={label}
            variant="outline"
            size="lg"
            className="h-16 rounded-2xl text-lg font-bold"
            disabled={shiftDisplay(elapsed, delta, settings, floor) === elapsed}
            onClick={() => setElapsed(shiftDisplay(elapsed, delta, settings, floor))}
          >
            {label}
          </Button>
        ))}
      </div>
      {atFloor ? (
        <p className="text-center text-sm text-muted-foreground">
          {`No puede ser anterior al último movimiento (${formatClock(elapsedToDisplay(floor, settings))})`}
        </p>
      ) : null}
      <Button variant="cta" size="lg" className="h-16 w-full rounded-2xl text-xl" onClick={() => onConfirm(elapsed)}>
        Confirmar
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="rounded-2xl" onClick={() => setMode("keypad")}>
          Teclear el tiempo
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

interface QuickTimeDialogProps extends BodyProps {
  open: boolean;
  title: string;
}

/**
 * Pide el tiempo de una jugada sin teclear: propone uno estimado y se corrige con ±20 s y ±1 min.
 * El fin de la parte se confirma con un toque; el teclado queda para los casos raros.
 */
export function QuickTimeDialog({ open, title, onCancel, ...body }: QuickTimeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {body.endOfPart ? "¿Cómo terminó la parte?" : "¿Cuándo fue? Ajusta al tiempo del marcador"}
          </DialogDescription>
        </DialogHeader>
        <Body {...body} onCancel={onCancel} />
      </DialogContent>
    </Dialog>
  );
}
