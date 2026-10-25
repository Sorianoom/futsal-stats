interface ScoreBannerProps {
  /** Rótulo pequeño sobre el título (p. ej. "Descanso"). */
  eyebrow: string;
  title: string;
  /** Línea secundaria opcional bajo el título. */
  note?: string;
  score: { for: number; against: number };
}

/** Cabecera oscura con el marcador grande: la misma del partido en vivo, para el descanso y el final. */
export function ScoreBanner({ eyebrow, title, note, score }: ScoreBannerProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-foreground px-7 py-5 text-background">
      <div className="space-y-1">
        <p className="text-xs font-extrabold tracking-widest text-cta uppercase">{eyebrow}</p>
        <h2 className="text-2xl font-extrabold">{title}</h2>
        {note ? <p className="text-base text-background/80">{note}</p> : null}
      </div>
      <p aria-label="Marcador" className="text-7xl leading-none font-extrabold tabular-nums">
        {score.for} – {score.against}
      </p>
    </header>
  );
}
