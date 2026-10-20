import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Breakdown } from "@/lib/api/types";

interface BreakdownDialogProps {
  open: boolean;
  /** Se conserva mientras el diálogo se anima al cerrarse, para que no se vacíe. */
  playerName: string | null;
  breakdown: Breakdown | null;
  onClose: () => void;
}

function signed(points: number): string {
  return points > 0 ? `+${points}` : String(points);
}

export function BreakdownDialog({ open, playerName, breakdown, onClose }: BreakdownDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{playerName ?? "Desglose"}</DialogTitle>
          <DialogDescription>Puntos de la semana</DialogDescription>
        </DialogHeader>
        {breakdown ? (
          <ul className="space-y-2 text-base">
            <li className="flex justify-between gap-4">
              <span>Base de la semana</span>
              <span className="font-medium tabular-nums">{breakdown.base}</span>
            </li>
            {breakdown.items.map((item, index) => (
              <li
                key={`${item.occurred_on}-${item.infraction_code ?? item.reason}-${index}`}
                className="flex justify-between gap-4"
              >
                <span>{item.reason}</span>
                <span
                  className={`font-medium tabular-nums ${item.points < 0 ? "text-destructive" : ""}`}
                >
                  {signed(item.points)}
                </span>
              </li>
            ))}
            <li className="border-t pt-2 text-lg font-bold">Total: {breakdown.total}</li>
          </ul>
        ) : (
          <p className="text-muted-foreground">Sin movimientos esta semana</p>
        )}
        <DialogFooter>
          <Button size="lg" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
