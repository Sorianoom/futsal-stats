"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface FantasyTab {
  id: string;
  label: string;
  /** Nombre corto e icono de la barra de abajo en el móvil. */
  short: string;
  icon: ReactNode;
  /** Solo se monta la pestaña activa: al entrar, sus datos se piden de nuevo. */
  render: () => ReactNode;
}

const NEXT_KEYS: Record<string, (index: number, count: number) => number> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
};

/**
 * Pestañas accesibles (patrón WAI-ARIA): flechas, Inicio y Fin cambian de pestaña. En el móvil
 * van en una barra fija abajo, con icono y nombre corto; desde `md`, arriba del contenido.
 */
export function FantasyTabs({ tabs, label }: { tabs: readonly FantasyTab[]; label: string }) {
  const [active, setActive] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const current = tabs[active];

  function handleKeyDown(event: KeyboardEvent) {
    const next = NEXT_KEYS[event.key];
    if (!next) return;
    event.preventDefault();
    const index = next(active, tabs.length);
    setActive(index);
    buttons.current[index]?.focus();
  }

  return (
    <div className="space-y-4 pb-28 md:pb-0">
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={handleKeyDown}
        className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-5 gap-1 rounded-3xl bg-foreground p-1.5 shadow-xl md:static md:flex md:overflow-x-auto md:rounded-2xl md:bg-muted md:p-1 md:shadow-none"
      >
        {tabs.map((tab, index) => {
          const selected = index === active;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                buttons.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              aria-label={tab.label}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(index)}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-bold whitespace-nowrap focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:min-h-12 md:flex-1 md:flex-row md:rounded-xl md:px-4 md:text-base",
                selected
                  ? "text-cta md:bg-background md:text-foreground md:shadow-sm"
                  : "text-slate-300 md:text-muted-foreground",
              )}
            >
              <span aria-hidden="true" className="md:hidden">
                {tab.icon}
              </span>
              <span aria-hidden="true" className="md:hidden">
                {tab.short}
              </span>
              <span aria-hidden="true" className="hidden md:inline">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`panel-${current.id}`} aria-labelledby={`tab-${current.id}`} className="space-y-4">
        {current.render()}
      </div>
    </div>
  );
}
