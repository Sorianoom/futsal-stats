import { Input } from "@/components/ui/input";

interface MillionsFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Texto de ayuda bajo el campo. */
  hint?: string;
  error?: string | null;
}

/** Importe en millones con decimales ("4,5"); el teclado numérico del iPad incluye la coma. */
export function MillionsField({ id, label, value, onChange, disabled, hint, error }: MillionsFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
          className="text-lg font-bold tabular-nums md:text-lg"
        />
        <span aria-hidden className="font-bold text-muted-foreground">
          M
        </span>
      </div>
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
