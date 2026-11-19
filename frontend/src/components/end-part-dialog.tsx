"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EndPartDialogProps {
  open: boolean;
  part: number;
  /** El tiempo tal y como se ve en el marcador, p. ej. "20:00". */
  timeText: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmación antes de anotar el fin de una parte: un toque por error cortaba la parte. */
export function EndPartDialog({ open, part, timeText, onConfirm, onCancel }: EndPartDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{`¿Terminar la ${part}ª parte en ${timeText}?`}</DialogTitle>
          <DialogDescription>Si te equivocas, se puede deshacer</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" size="lg" className="h-14 text-lg" onClick={onCancel}>
            Seguir jugando
          </Button>
          <Button variant="destructive" size="lg" className="h-14 text-lg" onClick={onConfirm}>
            Terminar la parte
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
