"use client";

import { useState } from "react";

import { FantasyPitch, SHORT_ROLE, SPOT } from "@/components/fantasy/pitch";
import { PlayerAvatar } from "@/components/player-avatar";
import type { FantasyRound, RoundSlot } from "@/lib/api/fantasy-types";
import { bonusLabel, breakdownLabel, formatContribution, formatScore, roundedScore } from "@/lib/fantasy/breakdown";
import { formatMoney, formatPoints, formatRating } from "@/lib/fantasy/format";
import { lineupSlots } from "@/lib/fantasy/lineup";
import { cn } from "@/lib/utils";

const NOTICE = "rounded-xl border p-3";
const CAPTAIN_MULTIPLIER = 2;
/** Color de la chapa de puntos: buen partido desde 9, flojo hasta 5 (la escala del reglamento). */
const GOOD_FROM = 9;
const POOR_UP_TO = 5;

function badgeClass(points: number): string {
  if (points >= GOOD_FROM) return "bg-gold text-[#0a1633]";
  if (points <= POOR_UP_TO) return "bg-[#8a97b8] text-[#0a1633]";
  return "bg-white text-[#0a1633]";
}

/** Por qué los puntos aún no son definitivos, o por qué la jornada puntuó 0. */
function RoundNotice({ round, mine }: { round: FantasyRound; mine: boolean }) {
  if (round.status === "pending") {
    return (
      <p className={`${NOTICE} text-muted-foreground`}>
        Jornada pendiente: los puntos llegan cuando se cierre el partido.
      </p>
    );
  }
  if (round.status === "scored") {
    return (
      <p className={`${NOTICE} text-muted-foreground`}>
        Puntos provisionales: se congelan, junto con los cobros y los valores, al cerrarse la jornada.
      </p>
    );
  }
  if (!round.negative_balance) return null;
  return (
    <p className={`${NOTICE} border-destructive/40 font-semibold text-destructive`}>
      {mine
        ? "Puntuó 0: tenías saldo negativo al bloquearse la alineación."
        : "Puntuó 0: tenía saldo negativo al bloquearse la alineación."}
    </p>
  );
}

interface PitchCardProps {
  label: string;
  slot: RoundSlot;
  showPoints: boolean;
  selected: boolean;
  onSelect: () => void;
}

/** Ficha de la jornada: foto, puntos, capitán y nombre. Tocarla explica sus puntos. */
function PitchCard({ label, slot, showPoints, selected, onSelect }: PitchCardProps) {
  const spot = SPOT[label];
  const role = SHORT_ROLE[label] ?? label;
  const place = { left: spot.left, top: spot.top };
  if (slot.name === null) {
    return (
      <div style={place} className="absolute flex -translate-x-1/2 flex-col items-center text-white">
        <span className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-white/75 bg-white/10 text-sm font-bold">
          0
        </span>
        <span className="mt-1 rounded-full bg-[#0a1633]/75 px-2 py-px text-xs font-bold">Vacío</span>
        <span className="text-[10px] font-extrabold tracking-widest text-white/75 uppercase">{role}</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-label={`${slot.name}: ${formatPoints(slot.points)}`}
      aria-pressed={selected}
      onClick={onSelect}
      style={place}
      className="group absolute flex -translate-x-1/2 flex-col items-center rounded-2xl text-white outline-none focus-visible:ring-3 focus-visible:ring-gold"
    >
      <span className="relative">
        <PlayerAvatar
          name={slot.name}
          dorsal={slot.dorsal ?? 0}
          photoUrl={slot.photo_url}
          className={cn(
            "size-14 border-3 text-2xl shadow-lg transition-transform group-active:scale-95",
            selected ? "border-gold ring-3 ring-gold/60" : slot.captain ? "border-gold" : "border-white",
          )}
        />
        {showPoints ? (
          <span
            aria-hidden="true"
            className={cn(
              "absolute -top-1 -right-3 grid h-5 min-w-6 place-items-center rounded-full border-2 border-[#0a1633] px-1 text-[11px] font-extrabold tabular-nums",
              badgeClass(slot.points),
            )}
          >
            {slot.points}
          </span>
        ) : null}
        {slot.captain ? (
          <span
            aria-hidden="true"
            className="absolute -top-1 -left-2.5 grid size-5 place-items-center rounded-full border-2 border-[#0a1633] bg-gold text-[11px] font-extrabold text-[#0a1633]"
          >
            C
          </span>
        ) : null}
      </span>
      <span className="mt-1 max-w-28 truncate rounded-full bg-[#0a1633]/75 px-2 py-px text-xs font-bold">
        {slot.name.split(" ")[0]}
      </span>
      <span className="text-[10px] font-extrabold tracking-widest text-white/75 uppercase">{role}</span>
    </button>
  );
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <li className={cn("flex items-baseline justify-between gap-3 py-1", strong && "border-t pt-2 font-extrabold")}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </li>
  );
}

/** Puntos que habría sacado sin que nada los anulara (copia que no era suya, saldo negativo). */
function earnedPoints(slot: RoundSlot): number | null {
  if (slot.score === null) return null;
  const bonus = slot.bonus.reduce((sum, item) => sum + item.points, 0);
  const base = Math.max(0, roundedScore(slot.score) + bonus);
  return slot.captain ? base * CAPTAIN_MULTIPLIER : base;
}

function NoScore({ slot }: { slot: RoundSlot }) {
  return (
    <p className="text-muted-foreground">
      {slot.rating === null
        ? "Sin nota: no jugó o jugó menos de 3 minutos, así que no puntúa."
        : `Nota ${formatRating(slot.rating)}.`}
    </p>
  );
}

/** El porqué de los puntos de un jugador: base, cada acción, redondeo, extras y capitán. */
function SlotExplanation({ slot, negativeBalance }: { slot: RoundSlot; negativeBalance: boolean }) {
  const name = slot.name ?? "";
  const earned = earnedPoints(slot);
  const voided = earned !== null && earned > 0 && slot.points === 0;
  return (
    <section aria-label={`Por qué: ${name}`} className="space-y-2 rounded-2xl border bg-muted/40 p-3">
      <h3 className="font-extrabold">{`${name} · ${formatPoints(slot.points)}`}</h3>
      {slot.score === null ? (
        <NoScore slot={slot} />
      ) : (
        <ul className="text-sm">
          {slot.breakdown.map((item) => (
            <Line
              key={item.key}
              label={breakdownLabel(item)}
              value={item.key === "base" ? formatScore(item.points) : formatContribution(item.points)}
            />
          ))}
          <Line
            label={`Nota exacta ${formatScore(slot.score)}, redondeada`}
            value={String(roundedScore(slot.score))}
            strong
          />
          {slot.bonus.map((item) => (
            <Line key={item.key} label={bonusLabel(item)} value={`+${item.points}`} />
          ))}
          {slot.captain ? <Line label="Capitán" value={`×${CAPTAIN_MULTIPLIER}`} /> : null}
          <Line label="Total" value={String(slot.points)} strong />
        </ul>
      )}
      {voided && !negativeBalance ? (
        <p className="text-sm font-semibold text-destructive">
          No puntúa: no estaba en la plantilla al empezar el partido.
        </p>
      ) : null}
      {slot.score !== null && slot.breakdown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Esta jornada se cerró antes de guardar el detalle de cada acción.
        </p>
      ) : null}
    </section>
  );
}

interface RoundLineupProps {
  round: FantasyRound;
  label: string;
  /** Es mi alineación: cambia cómo se explica el saldo negativo. */
  mine?: boolean;
}

/** Alineación de una jornada en la pista, con los puntos de cada uno y el porqué al tocarlo. */
export function RoundLineup({ round, label, mine = false }: RoundLineupProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const labels = lineupSlots().map((slot) => slot.label);
  const showPoints = round.status !== "pending";
  const chosen = selected !== null ? round.slots[selected] : null;

  return (
    <section aria-label={label} className="space-y-3">
      <RoundNotice round={round} mine={mine} />
      <FantasyPitch>
        {round.slots.map((slot, index) => (
          <PitchCard
            key={slot.copy_id ?? `empty-${index}`}
            label={labels[index]}
            slot={slot}
            showPoints={showPoints}
            selected={selected === index}
            onSelect={() => setSelected(selected === index ? null : index)}
          />
        ))}
      </FantasyPitch>
      <p className="text-lg font-extrabold">{`Total: ${formatPoints(round.total)}`}</p>
      {mine && round.status === "settled" ? (
        <p className="font-semibold">{`Cobrado: ${formatMoney(round.payout)}`}</p>
      ) : null}
      {chosen && showPoints ? <SlotExplanation slot={chosen} negativeBalance={round.negative_balance} /> : null}
      {!chosen && showPoints ? (
        <p className="text-sm text-muted-foreground">Toca un jugador para ver por qué ha sacado esos puntos.</p>
      ) : null}
    </section>
  );
}
