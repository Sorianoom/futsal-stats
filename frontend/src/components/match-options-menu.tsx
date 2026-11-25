"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface MatchOption {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
}

/** Botón ⋯ con las opciones del partido (convocatoria, traspaso, borrar). */
export function MatchOptionsMenu({ options }: { options: MatchOption[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Opciones del partido"
        aria-expanded={open}
        aria-controls="match-options"
        onClick={() => setOpen((value) => !value)}
        className="flex size-12 items-center justify-center rounded-full border bg-card text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [@media(hover:hover)]:hover:bg-muted"
      >
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      {open ? (
        <ul
          id="match-options"
          className="absolute top-[calc(100%+0.5rem)] right-0 z-30 w-64 space-y-0.5 rounded-2xl border bg-card p-1.5 shadow-xl"
        >
          {options.map((option) => (
            <li key={option.label}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  option.onSelect();
                }}
                className={cn(
                  "flex min-h-12 w-full items-center rounded-xl px-3 text-left text-base font-semibold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [@media(hover:hover)]:hover:bg-muted",
                  option.destructive && "text-destructive",
                )}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
