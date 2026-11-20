import type { FantasyMode } from "@/lib/fantasy/theme";

const ICON = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round",
  "aria-hidden": true,
} as const;

/** Sol en modo oscuro (pasar a claro) y luna en modo claro (pasar a oscuro). */
export function ThemeToggle({ mode, onToggle }: { mode: FantasyMode; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={mode === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className="grid size-11 shrink-0 place-items-center rounded-xl border bg-card text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
    >
      {mode === "dark" ? (
        <svg {...ICON}>
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
        </svg>
      ) : (
        <svg {...ICON}>
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        </svg>
      )}
    </button>
  );
}
