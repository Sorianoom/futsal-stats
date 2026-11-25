"use client";

import type { MouseEvent } from "react";

import { cn } from "@/lib/utils";

/**
 * Media pista de fútbol sala (20 × 20 m) con la portería abajo: la que recibe el gol. Cada unidad
 * del dibujo son 10 cm. Los puntos van de 0 a 100 (ver `lib/match/goal-detail.ts`).
 */
const SIZE = 200;
const MARGIN = 10;
const GOAL_DEPTH = 10;
const VIEW_BOX = `${-MARGIN} ${-MARGIN} ${SIZE + 2 * MARGIN} ${SIZE + 2 * MARGIN}`;
const VIEW = SIZE + 2 * MARGIN;
const PERCENT = 100;
const SCALE = SIZE / PERCENT;

export interface CourtPoint {
  x: number;
  y: number;
  /** Color del punto: los goles en contra en rojo, los nuestros en azul. */
  tone?: "against" | "for";
}

function toSvg(point: CourtPoint): { cx: number; cy: number } {
  return { cx: point.x * SCALE, cy: SIZE - point.y * SCALE };
}

function clampPercent(value: number): number {
  return Math.min(PERCENT, Math.max(0, Math.round(value)));
}

/** Del toque en pantalla al punto 0–100 de la pista. */
function pointFromClick(event: MouseEvent<HTMLElement>): CourtPoint {
  const rect = event.currentTarget.getBoundingClientRect();
  const svgX = ((event.clientX - rect.left) / rect.width) * VIEW - MARGIN;
  const svgY = ((event.clientY - rect.top) / rect.height) * VIEW - MARGIN;
  return { x: clampPercent(svgX / SCALE), y: clampPercent((SIZE - svgY) / SCALE) };
}

function Lines() {
  return (
    <g fill="none" stroke="currentColor" strokeOpacity={0.55} strokeWidth={1.5}>
      <rect x={0} y={0} width={SIZE} height={SIZE} />
      {/* Medio campo con su semicírculo (radio 3 m). */}
      <path d="M70 0 A30 30 0 0 0 130 0" />
      {/* Área: cuartos de círculo de 6 m desde cada poste unidos por una recta. */}
      <path d="M25 200 A60 60 0 0 1 85 140 L115 140 A60 60 0 0 1 175 200" />
      <circle cx={100} cy={140} r={1.5} fill="currentColor" />
      <circle cx={100} cy={100} r={1.5} fill="currentColor" />
      <rect x={85} y={SIZE} width={30} height={GOAL_DEPTH - 2} strokeWidth={2.5} />
    </g>
  );
}

interface HalfCourtProps {
  /** Nombre para lectores de pantalla. */
  label: string;
  /** Goles que dibujar (resumen de estadísticas). */
  points?: readonly CourtPoint[];
  /** Punto elegido (al anotar un gol). */
  selected?: CourtPoint | null;
  /** Si llega, se puede tocar la pista para elegir el punto. */
  onPick?: (point: CourtPoint) => void;
  className?: string;
}

export function HalfCourt({ label, points = [], selected = null, onPick, className }: HalfCourtProps) {
  const drawing = (
    <svg viewBox={VIEW_BOX} aria-hidden="true" className="block size-full text-white">
      <rect x={-MARGIN} y={-MARGIN} width={VIEW} height={VIEW} className="fill-primary" />
      <Lines />
      {points.map((point, index) => (
        <circle
          key={index}
          {...toSvg(point)}
          r={5}
          stroke="white"
          strokeWidth={1.5}
          className={point.tone === "for" ? "fill-sky-300" : "fill-destructive"}
        />
      ))}
      {selected ? (
        <g>
          <circle {...toSvg(selected)} r={9} fill="none" stroke="white" strokeWidth={2} />
          <circle {...toSvg(selected)} r={4.5} className="fill-cta" />
        </g>
      ) : null}
    </svg>
  );
  const box = cn("block aspect-square w-full max-w-80 overflow-hidden rounded-2xl", className);

  if (!onPick) {
    return (
      <div role="img" aria-label={label} className={box}>
        {drawing}
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => {
        // El teclado (Intro) no trae coordenadas: el punto se elige tocando la pista.
        if (event.detail === 0) return;
        onPick(pointFromClick(event));
      }}
      className={cn(box, "touch-manipulation outline-none focus-visible:ring-3 focus-visible:ring-ring/50")}
    >
      {drawing}
    </button>
  );
}
