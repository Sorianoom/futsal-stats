import { Button } from "@/components/ui/button";
import type { Infraction, InfractionRegistered } from "@/lib/api/types";
import { sanctionText } from "@/lib/labels";
import { formatWeekRange } from "@/lib/weeks";

interface RegistrationResultProps {
  result: InfractionRegistered;
  playerName: string;
  infractions: Infraction[];
  /** Semana que se está viendo: si la falta cae en otra, se avisa. */
  visibleWeek: string;
  onDismiss: () => void;
}

export function RegistrationResult({
  result,
  playerName,
  infractions,
  visibleWeek,
  onDismiss,
}: RegistrationResultProps) {
  const descriptionOf = (code: string) =>
    infractions.find((infraction) => infraction.code === code)?.description ?? code;
  const points = result.movement.points;

  return (
    <div role="status" className="space-y-2 rounded-xl border bg-card p-4">
      <p className="text-lg font-semibold">
        Falta registrada: {playerName} ({points > 0 ? `+${points}` : points} puntos)
      </p>
      {result.movement.applies_week !== visibleWeek ? (
        <p>Se aplica a la semana del {formatWeekRange(result.movement.applies_week)}</p>
      ) : null}
      {result.sanction ? (
        <p>
          Sanción propuesta: {sanctionText(result.sanction)}. El entrenador la confirma más adelante.
        </p>
      ) : null}
      {result.escalations.map((escalation) => (
        <p key={`${escalation.infraction_code}-${escalation.week}-${escalation.session_id ?? ""}`}>
          Propuesta: {escalation.infraction_code} · {descriptionOf(escalation.infraction_code)}
        </p>
      ))}
      <Button variant="outline" onClick={onDismiss}>
        Entendido
      </Button>
    </div>
  );
}
