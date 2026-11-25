/** Media pista del Fantasy (1-2-1) con sus líneas; las fichas van dentro, en `SPOT`. */

import type { ReactNode } from "react";

/** Sitio de cada hueco en la media pista: pívot arriba, alas, cierre y portero abajo. */
export const SPOT: Record<string, { left: string; top: number }> = {
  Pívot: { left: "50%", top: 22 },
  "Ala izquierda": { left: "21%", top: 104 },
  "Ala derecha": { left: "79%", top: 104 },
  Cierre: { left: "50%", top: 190 },
  Portero: { left: "50%", top: 284 },
};

/** Nombre corto del puesto bajo la ficha. */
export const SHORT_ROLE: Record<string, string> = { "Ala izquierda": "Ala", "Ala derecha": "Ala" };

export function FantasyPitch({ children }: { children: ReactNode }) {
  return (
    <div className="fantasy-pitch relative mx-auto h-[392px] max-w-md overflow-hidden rounded-3xl shadow-lg">
        <div aria-hidden="true" className="pointer-events-none absolute inset-3 rounded-b-2xl border-2 border-t-0 border-white/20" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-3 top-3 border-t-2 border-white/35" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-3 left-1/2 h-11 w-24 -translate-x-1/2 rounded-b-full border-2 border-t-0 border-white/20"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3 left-1/2 h-16 w-40 -translate-x-1/2 rounded-t-full border-2 border-b-0 border-white/20"
        />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-3 left-1/2 h-1.5 w-11 -translate-x-1/2 rounded-t bg-gold" />
        <span aria-hidden="true" className="absolute top-4 left-5 text-[10px] font-extrabold tracking-widest text-gold">
          1-2-1
        </span>
      {children}
    </div>
  );
}
