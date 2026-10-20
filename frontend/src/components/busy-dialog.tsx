"use client";

import { useState, type ReactNode } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface BusyControl {
  busy: boolean;
  setBusy: (busy: boolean) => void;
}

interface BusyDialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  className?: string;
  children: (control: BusyControl) => ReactNode;
}

/**
 * Diálogo que no se cierra (Escape, overlay, cancelar) mientras hay una petición en vuelo: si se
 * cerrara, el usuario no sabría si se guardó y podría repetir la acción.
 */
export function BusyDialog({ open, title, onClose, className, children }: BusyDialogProps) {
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent className={cn("max-h-[calc(100dvh-2rem)] overflow-y-auto", className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children({ busy, setBusy })}
      </DialogContent>
    </Dialog>
  );
}
