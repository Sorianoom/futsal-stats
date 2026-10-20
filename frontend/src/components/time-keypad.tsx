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
import {
  elapsedToDisplay,
  formatClock,
  parseScoreboard,
  secondsToDigits,
  type ClockSettings,
} from "@/lib/match/clock";

const MAX_DIGITS = 4;
const DIGIT_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

function showDigits(digits: string): string {
  const padded = digits.padStart(MAX_DIGITS, "0");
  return `${padded.slice(0, 2)}:${padded.slice(2)}`;
}

interface BodyProps {
  settings: ClockSettings;
  initialElapsed: number;
  minElapsed?: number;
  onConfirm: (elapsed: number) => void;
  onCancel: () => void;
}

function KeypadBody({ settings, initialElapsed, minElapsed, onConfirm, onCancel }: BodyProps) {
  const [digits, setDigits] = useState(() => secondsToDigits(elapsedToDisplay(initialElapsed, settings)));
  // Hasta la primera pulsación el tiempo mostrado es el anterior; la primera tecla lo sustituye.
  const [untouched, setUntouched] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function press(digit: string) {
    setError(null);
    setDigits(untouched ? digit : `${digits}${digit}`.slice(0, MAX_DIGITS));
    setUntouched(false);
  }

  function erase() {
    setError(null);
    setDigits(digits.slice(0, -1));
    setUntouched(false);
  }

  function accept() {
    const parsed = parseScoreboard(digits, settings);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (minElapsed !== undefined && parsed.elapsed < minElapsed) {
      const last = formatClock(elapsedToDisplay(minElapsed, settings));
      setError(`Ese tiempo es anterior al último movimiento (${last})`);
      return;
    }
    onConfirm(parsed.elapsed);
  }

  return (
    <div className="space-y-4">
      <p role="status" className="text-center text-6xl font-bold tabular-nums">
        {showDigits(digits)}
      </p>
      <div className="grid grid-cols-3 gap-3">
        {DIGIT_ROWS.flat().map((digit) => (
          <Button key={digit} variant="outline" size="lg" className="text-2xl" onClick={() => press(digit)}>
            {digit}
          </Button>
        ))}
        <Button variant="ghost" size="lg" onClick={erase}>
          Borrar
        </Button>
        <Button variant="outline" size="lg" className="text-2xl" onClick={() => press("0")}>
          0
        </Button>
        <Button size="lg" onClick={accept}>
          Aceptar
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-center text-base text-destructive">
          {error}
        </p>
      ) : null}
      <Button variant="outline" className="w-full" onClick={onCancel}>
        Cancelar
      </Button>
    </div>
  );
}

interface TimeKeypadProps extends BodyProps {
  open: boolean;
  title: string;
}

/** Teclado numérico para escribir lo que marca el marcador de mesa (mm:ss). */
export function TimeKeypad({ open, title, onCancel, ...body }: TimeKeypadProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Escribe el tiempo que marca el marcador</DialogDescription>
        </DialogHeader>
        <KeypadBody {...body} onCancel={onCancel} />
      </DialogContent>
    </Dialog>
  );
}
