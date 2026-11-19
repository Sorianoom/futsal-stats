import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { formatMoney, formatValueChange } from "@/lib/fantasy/format";
import { cn } from "@/lib/utils";

/** Flecha y cifra del cambio de valor en la última jornada cerrada. */
export function ValueChange({ change }: { change: number }) {
  const Icon = change > 0 ? ArrowUp : change < 0 ? ArrowDown : Minus;
  const label =
    change > 0 ? `Sube ${formatMoney(change)}` : change < 0 ? `Baja ${formatMoney(-change)}` : "Sin cambios";
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-0.5 text-sm font-bold tabular-nums",
        change > 0 && "text-primary",
        change < 0 && "text-destructive",
        change === 0 && "text-muted-foreground",
      )}
    >
      <Icon aria-hidden className="size-4" />
      {formatValueChange(change)}
    </span>
  );
}
