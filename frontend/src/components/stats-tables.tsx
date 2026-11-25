"use client";

import { useState } from "react";

import type { MatchPlayerStats, PlayerStats, QuintetStats, SeasonPlayerStats } from "@/lib/api/stats-types";
import { formatClock } from "@/lib/match/clock";
import { cn } from "@/lib/utils";

/**
 * Grupos de columnas: en el móvil solo cabe uno a la vez (más el jugador), así que se elige con
 * unos botones; desde `sm` se ven todas las columnas.
 */
type GroupId = "minutes" | "attack" | "defense" | "discipline" | "keeper";

const GROUP_LABEL: Record<GroupId, string> = {
  minutes: "Minutos",
  attack: "Ataque",
  defense: "Defensa",
  discipline: "Faltas",
  keeper: "Portero",
};

interface Column<T> {
  short: string;
  title: string;
  /** Grupo con el que sale en el móvil; sin grupo, sale siempre. */
  group?: GroupId;
  value: (player: T) => string | number;
  strong?: boolean;
}

const ACTION_COLUMNS: readonly Column<PlayerStats>[] = [
  { short: "G", title: "Goles", group: "attack", value: (p) => p.goals },
  { short: "A", title: "Asistencias", group: "attack", value: (p) => p.assists },
  { short: "T", title: "Tiros", group: "attack", value: (p) => p.shots },
  { short: "P", title: "Pérdidas", group: "defense", value: (p) => p.turnovers },
  { short: "R", title: "Robos", group: "defense", value: (p) => p.steals },
  { short: "AC", title: "Acciones clave", group: "defense", value: (p) => p.key_actions },
  { short: "F", title: "Faltas", group: "discipline", value: (p) => p.fouls },
  { short: "Am", title: "Amarillas", group: "discipline", value: (p) => p.yellows },
  { short: "Roj", title: "Rojas", group: "discipline", value: (p) => p.reds },
  { short: "Par", title: "Paradas", group: "keeper", value: (p) => p.saves },
];

const RATING = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "7,5"; una raya si no hay nota. */
function noteText(rating: number | null): string {
  return rating === null ? "—" : RATING.format(rating);
}

const MATCH_COLUMNS: readonly Column<MatchPlayerStats>[] = [
  { short: "Min", title: "Minutos", value: (p) => formatClock(p.seconds) },
  ...ACTION_COLUMNS,
  { short: "Nota", title: "Nota", value: (p) => noteText(p.rating), strong: true },
];

function perMatch(player: SeasonPlayerStats): string {
  if (player.matches_played === 0) return formatClock(0);
  return formatClock(Math.round(player.seconds / player.matches_played));
}

const SEASON_COLUMNS: readonly Column<SeasonPlayerStats>[] = [
  { short: "PJ", title: "Partidos jugados", group: "minutes", value: (p) => p.matches_played },
  { short: "Min", title: "Minutos", group: "minutes", value: (p) => formatClock(p.seconds) },
  { short: "Min/p", title: "Minutos por partido jugado", group: "minutes", value: perMatch },
  ...ACTION_COLUMNS,
];

const HEADER_CELL =
  "px-2 py-3 text-left text-xs font-extrabold tracking-wider text-muted-foreground uppercase sm:px-3";
const ROW_HEADER = "px-2 py-3 text-left text-sm font-bold break-words sm:px-3 sm:text-base";
const CELL = "px-2 py-3 text-base tabular-nums sm:px-3";
// `relative`: los textos solo para lectores (sr-only, absolutos) no ensanchan la página.
const SCROLLER = "relative overflow-x-auto rounded-3xl border bg-card";

/** En el móvil, oculta las columnas de otros grupos. */
function phoneVisibility(column: Column<never>, group: GroupId): string | undefined {
  return column.group === undefined || column.group === group ? undefined : "hidden sm:table-cell";
}

function groupsOf<T>(columns: readonly Column<T>[]): GroupId[] {
  return [...new Set(columns.flatMap((column) => (column.group ? [column.group] : [])))];
}

function GroupPicker({ groups, value, onChange }: { groups: GroupId[]; value: GroupId; onChange: (g: GroupId) => void }) {
  return (
    <div
      role="group"
      aria-label="Columnas"
      style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}
      className="mb-2 grid gap-1 rounded-2xl bg-muted p-1 sm:hidden"
    >
      {groups.map((group) => (
        <button
          key={group}
          type="button"
          aria-pressed={group === value}
          onClick={() => onChange(group)}
          className={cn(
            "min-h-10 truncate rounded-xl px-1 text-sm font-bold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            group === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
          )}
        >
          {GROUP_LABEL[group]}
        </button>
      ))}
    </div>
  );
}

interface StatsTableProps<T> {
  players: readonly T[];
  columns: readonly Column<T>[];
  region: string;
  label: string;
}

function StatsTable<T extends PlayerStats>({ players, columns, region, label }: StatsTableProps<T>) {
  const groups = groupsOf(columns);
  const [group, setGroup] = useState<GroupId>(groups[0]);
  return (
    <div>
      <GroupPicker groups={groups} value={group} onChange={setGroup} />
      <div role="region" aria-label={region} tabIndex={0} className={SCROLLER}>
        <table aria-label={label} className="w-full">
          <thead>
            <tr className="border-b">
              <th scope="col" className={HEADER_CELL}>
                Jugador
              </th>
              {columns.map((column) => (
                <th
                  key={column.title}
                  scope="col"
                  title={column.title}
                  className={cn(HEADER_CELL, phoneVisibility(column as Column<never>, group))}
                >
                  <span aria-hidden="true">{column.short}</span>
                  <span className="sr-only">{column.title}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr key={player.player_id} className="border-b last:border-0">
                <th scope="row" className={ROW_HEADER}>{`${player.dorsal} · ${player.name}`}</th>
                {columns.map((column) => (
                  <td
                    key={column.title}
                    className={cn(CELL, column.strong && "font-extrabold", phoneVisibility(column as Column<never>, group))}
                  >
                    {column.value(player)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PlayerStatsTable({ players }: { players: readonly MatchPlayerStats[] }) {
  return <StatsTable players={players} columns={MATCH_COLUMNS} region="Tabla de jugadores" label="Jugadores" />;
}

export function SeasonStatsTable({ players }: { players: readonly SeasonPlayerStats[] }) {
  return <StatsTable players={players} columns={SEASON_COLUMNS} region="Tabla de la temporada" label="Temporada" />;
}

function ratingText(quintet: QuintetStats): string {
  if (quintet.rating_average === null) return "Sin valorar";
  return `${RATING.format(quintet.rating_average)} ★ (${quintet.rating_count})`;
}

interface QuintetStatsTableProps {
  quintets: readonly QuintetStats[];
  nameOf: (playerId: string) => string;
}

export function QuintetStatsTable({ quintets, nameOf }: QuintetStatsTableProps) {
  return (
    <div role="region" aria-label="Tabla de quintetos" tabIndex={0} className={SCROLLER}>
      <table aria-label="Quintetos" className="w-full">
        <thead>
          <tr className="border-b">
            <th scope="col" className={HEADER_CELL}>
              Quinteto
            </th>
            <th scope="col" className={HEADER_CELL} title="Tiempo juntos en pista">
              Tiempo
            </th>
            <th scope="col" className={HEADER_CELL} title="Goles a favor y en contra con ese quinteto">
              Goles
            </th>
            <th scope="col" className={HEADER_CELL} title="Valoración media con estrellas">
              Valoración
            </th>
          </tr>
        </thead>
        <tbody>
          {quintets.map((quintet) => (
            <tr key={quintet.player_ids.join("|")} className="border-b last:border-0">
              <td className="px-2 py-3 text-base sm:px-3 sm:text-lg">
                {quintet.player_ids
                  .map(nameOf)
                  .sort((a, b) => a.localeCompare(b, "es"))
                  .join(", ")}
              </td>
              <td className={CELL}>{formatClock(quintet.seconds)}</td>
              <td className={cn(CELL, "whitespace-nowrap")}>{`${quintet.goals_for} – ${quintet.goals_against}`}</td>
              <td className={CELL}>{ratingText(quintet)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
