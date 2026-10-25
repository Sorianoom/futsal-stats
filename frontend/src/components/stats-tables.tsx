import type { PlayerStats, QuintetStats, SeasonPlayerStats } from "@/lib/api/stats-types";
import { formatClock } from "@/lib/match/clock";

const PLAYER_COLUMNS = [
  { short: "Min", title: "Minutos" },
  { short: "G", title: "Goles" },
  { short: "A", title: "Asistencias" },
  { short: "T", title: "Tiros" },
  { short: "P", title: "Pérdidas" },
  { short: "R", title: "Robos" },
  { short: "F", title: "Faltas" },
  { short: "Am", title: "Amarillas" },
  { short: "Roj", title: "Rojas" },
] as const;

const HEADER_CELL = "px-3 py-3 text-left text-xs font-extrabold tracking-wider text-muted-foreground uppercase";
const ROW_HEADER = "px-3 py-3 text-left text-base font-bold";
const SCROLLER = "overflow-x-auto rounded-3xl border bg-card";

/** Cabecera de columna: abreviada a la vista pero con el nombre completo para lectores. */
function ColumnHeader({ short, title }: { short: string; title: string }) {
  return (
    <th scope="col" title={title} className={HEADER_CELL}>
      <span aria-hidden="true">{short}</span>
      <span className="sr-only">{title}</span>
    </th>
  );
}
const CELL = "px-3 py-3 text-base tabular-nums";

function actionsOf(player: PlayerStats): number[] {
  return [
    player.goals,
    player.assists,
    player.shots,
    player.turnovers,
    player.steals,
    player.fouls,
    player.yellows,
    player.reds,
  ];
}

export function PlayerStatsTable({ players }: { players: readonly PlayerStats[] }) {
  return (
    <div role="region" aria-label="Tabla de jugadores" tabIndex={0} className={SCROLLER}>
      <table aria-label="Jugadores" className="w-full">
        <thead>
          <tr className="border-b">
            <th scope="col" className={HEADER_CELL}>
              Jugador
            </th>
            {PLAYER_COLUMNS.map((column) => (
              <ColumnHeader key={column.title} short={column.short} title={column.title} />
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr key={player.player_id} className="border-b last:border-0">
              <th scope="row" className={ROW_HEADER}>{`${player.dorsal} · ${player.name}`}</th>
              <td className={CELL}>{formatClock(player.seconds)}</td>
              {actionsOf(player).map((value, index) => (
                <td key={PLAYER_COLUMNS[index + 1].title} className={CELL}>
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const RATING = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

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
              <td className="px-3 py-3 text-lg">
                {quintet.player_ids
                  .map(nameOf)
                  .sort((a, b) => a.localeCompare(b, "es"))
                  .join(", ")}
              </td>
              <td className={CELL}>{formatClock(quintet.seconds)}</td>
              <td className={CELL}>{`${quintet.goals_for} – ${quintet.goals_against}`}</td>
              <td className={CELL}>{ratingText(quintet)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SEASON_COLUMNS = [
  { short: "PJ", title: "Partidos jugados" },
  { short: "Min", title: "Minutos" },
  { short: "Min/p", title: "Minutos por partido jugado" },
  ...PLAYER_COLUMNS.slice(1),
] as const;

function perMatch(player: SeasonPlayerStats): string {
  if (player.matches_played === 0) return formatClock(0);
  return formatClock(Math.round(player.seconds / player.matches_played));
}

export function SeasonStatsTable({ players }: { players: readonly SeasonPlayerStats[] }) {
  return (
    <div role="region" aria-label="Tabla de la temporada" tabIndex={0} className={SCROLLER}>
      <table aria-label="Temporada" className="w-full">
        <thead>
          <tr className="border-b">
            <th scope="col" className={HEADER_CELL}>
              Jugador
            </th>
            {SEASON_COLUMNS.map((column) => (
              <ColumnHeader key={column.title} short={column.short} title={column.title} />
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr key={player.player_id} className="border-b last:border-0">
              <th scope="row" className={ROW_HEADER}>{`${player.dorsal} · ${player.name}`}</th>
              <td className={CELL}>{player.matches_played}</td>
              <td className={CELL}>{formatClock(player.seconds)}</td>
              <td className={CELL}>{perMatch(player)}</td>
              {actionsOf(player).map((value, index) => (
                <td key={PLAYER_COLUMNS[index + 1].title} className={CELL}>
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
