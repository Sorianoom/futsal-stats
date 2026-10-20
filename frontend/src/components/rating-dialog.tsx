"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STARS = [1, 2, 3, 4, 5] as const;

interface RatingDialogProps {
  open: boolean;
  onPick: (stars: number) => void;
  onClose: () => void;
}

export function RatingDialog({ open, onPick, onClose }: RatingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Valorar quinteto</DialogTitle>
          <DialogDescription>Cómo está funcionando el quinteto que hay en pista</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-5 gap-3">
          {STARS.map((stars) => (
            <Button
              key={stars}
              variant="outline"
              size="lg"
              aria-label={`${stars} ${stars === 1 ? "estrella" : "estrellas"}`}
              onClick={() => onPick(stars)}
            >
              {stars}★
            </Button>
          ))}
        </div>
        <Button variant="ghost" className="w-full" onClick={onClose}>
          Cancelar
        </Button>
      </DialogContent>
    </Dialog>
  );
}
