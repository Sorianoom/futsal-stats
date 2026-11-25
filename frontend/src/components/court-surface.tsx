import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface CourtSurfaceProps {
  /** Rótulo en la esquina superior izquierda. */
  title: string;
  className?: string;
  /** Lo que se dibuja sobre la pista, colocado en absoluto (en % del ancho y del alto). */
  children: ReactNode;
}

/** La cancha en azul con sus líneas: el fondo común del partido en vivo y de la elección de titulares. */
export function CourtSurface({ title, className, children }: CourtSurfaceProps) {
  return (
    <section className={cn("relative aspect-[4/3] w-full sm:aspect-[724/500] overflow-hidden rounded-[28px] bg-primary", className)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 724 500"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        stroke="white"
        strokeOpacity={0.28}
        strokeWidth={3}
        className="absolute inset-0 size-full"
      >
        <rect x="24" y="24" width="676" height="452" rx="8" />
        <path d="M362 24v452" />
        <circle cx="362" cy="250" r="62" />
        <path d="M24 142a108 108 0 0 1 0 216M700 142a108 108 0 0 0 0 216" />
      </svg>
      <h2 className="absolute top-3 left-4 text-[10px] sm:top-6 sm:left-7 sm:text-xs font-extrabold tracking-widest text-white/85 uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}
