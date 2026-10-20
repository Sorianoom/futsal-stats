import { Button } from "@/components/ui/button";
import { currentWeekStart, formatWeekRange, shiftWeek } from "@/lib/weeks";

interface WeekNavigatorProps {
  /** Lunes de la semana mostrada, `YYYY-MM-DD`. */
  week: string;
  onChange: (week: string) => void;
}

export function WeekNavigator({ week, onChange }: WeekNavigatorProps) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="lg"
        aria-label="Semana anterior"
        onClick={() => onChange(shiftWeek(week, -1))}
      >
        ←
      </Button>
      <p aria-live="polite" className="min-w-52 text-center text-lg font-medium">
        {formatWeekRange(week)}
      </p>
      <Button
        variant="outline"
        size="lg"
        aria-label="Semana siguiente"
        onClick={() => onChange(shiftWeek(week, 1))}
      >
        →
      </Button>
      <Button variant="ghost" size="lg" onClick={() => onChange(currentWeekStart())}>
        Hoy
      </Button>
    </div>
  );
}
