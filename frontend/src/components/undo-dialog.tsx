"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface UndoDialogProps {
  /** Qué se va a deshacer, p. ej. "Gol de Ana Ruiz". Null mantiene el diálogo cerrado. */
  description: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function UndoDialog({ description, onConfirm, onClose }: UndoDialogProps) {
  return (
    <Dialog open={description !== null} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Deshacer</DialogTitle>
          <DialogDescription>Se deshace lo último anotado</DialogDescription>
        </DialogHeader>
        <p className="text-xl font-medium">{description}</p>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" size="lg" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="destructive" size="lg" onClick={onConfirm}>
            Confirmar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
