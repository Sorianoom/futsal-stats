import { tierOf } from "@/lib/fantasy/form";
import { cn } from "@/lib/utils";

const BAR_HEIGHT = 16;
const TOP_POINTS = 11;
const BAR_COLOR = { good: "bg-gold", mid: "bg-[#5b86ff]", poor: "bg-[#8a97b8]" } as const;

/** Barritas con los puntos de las últimas jornadas de un jugador (la última, a la derecha). */
export function Spark({ points, className }: { points: readonly number[]; className?: string }) {
  if (points.length === 0) return null;
  return (
    <span
      role="img"
      aria-label={`Últimas jornadas: ${points.join(", ")} puntos`}
      className={cn("flex h-4 items-end gap-[3px]", className)}
    >
      {points.map((value, index) => (
        <span
          // Una barra por jornada, en orden fijo: la posición es su identidad.
          key={index}
          className={cn("w-[7px] rounded-[2px]", BAR_COLOR[tierOf(value)])}
          style={{ height: Math.max(2, Math.round((Math.min(value, TOP_POINTS) / TOP_POINTS) * BAR_HEIGHT)) }}
        />
      ))}
    </span>
  );
}
