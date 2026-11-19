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
import { formatClock, type ClockSettings } from "@/lib/match/clock";

/** Lo que se ve en el marcador sube (+) o baja (−); vale hacia delante y hacia atrás. */
const SHIFTS = [
  { label: "−10 s", delta: -10 },
  { label: "−1 s", delta: -1 },
  { label: "+1 s", delta: 1 },
  { label: "+10 s", delta: 10 },
];
const MINUTE = 60;
const MAX_PART_SECONDS = 60 * MINUTE;

interface BodyProps {
  elapsed: number;
  partSeconds: number;
  onShift: (deltaSeconds: number) => void;
  onSet: (elapsed: number) => void;
  onPartSeconds: (partSeconds: number) => void;
  onClose: () => void;
}

function Body({ elapsed, partSeconds, onShift, onSet, onPartSeconds, onClose }: BodyProps) {
  const [typing, setTyping] = useState(false);
  // El marcador del pabellón siempre va hacia atrás desde la duración de la parte.
  const settings: ClockSettings = { direction: "down", partSeconds };

  if (typing) {
    return (
      <KeypadBody
        settings={settings}
        initialElapsed={elapsed}
        onConfirm={(typed) => {
          onSet(typed);
          onClose();
        }}
        onCancel={() => setTyping(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <p role="status" className="text-center text-7xl font-extrabold tabular-nums">
        {formatClock(partSeconds - elapsed)}
      </p>
      <div className="grid grid-cols-4 gap-2">
        {SHIFTS.map(({ label, delta }) => (
          <Button
            key={label}
            variant="outline"
            size="lg"
            className="h-16 rounded-2xl text-lg font-bold"
            onClick={() => onShift(delta)}
          >
            {label}
          </Button>
        ))}
      </div>
      <Button variant="outline" size="lg" className="h-14 w-full rounded-2xl" onClick={() => setTyping(true)}>
        Teclear el tiempo
      </Button>
      <div className="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2">
        <Button
          variant="ghost"
          size="lg"
          aria-label="Parte de 1 min menos"
          disabled={partSeconds <= MINUTE}
          onClick={() => onPartSeconds(partSeconds - MINUTE)}
        >
          −
        </Button>
        <p className="text-base font-bold tabular-nums">{`Parte de ${formatClock(partSeconds)}`}</p>
        <Button
          variant="ghost"
          size="lg"
          aria-label="Parte de 1 min más"
          disabled={partSeconds >= MAX_PART_SECONDS}
          onClick={() => onPartSeconds(partSeconds + MINUTE)}
        >
          +
        </Button>
      </div>
      <Button variant="cta" size="lg" className="h-16 w-full rounded-2xl text-xl" onClick={onClose}>
        Listo
      </Button>
    </div>
  );
}

interface ClockAdjustDialogProps extends BodyProps {
  open: boolean;
}

/** Cuadra el reloj de la app con el marcador de la mesa: ±1 s, ±10 s o tecleando el tiempo exacto. */
export function ClockAdjustDialog({ open, onClose, ...body }: ClockAdjustDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Ajustar el reloj</DialogTitle>
          <DialogDescription>Déjalo igual que el marcador de la mesa</DialogDescription>
        </DialogHeader>
        <Body {...body} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}
