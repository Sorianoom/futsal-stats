import type { PlayerStats, QuintetStats } from "@/lib/api/stats-types";
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

const HEADER_CELL = "px-3 py-2 text-left text-sm font-semibold text-muted-foreground";
const CELL = "px-3 py-3 text-lg tabular-nums";

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
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table aria-label="Jugadores" className="w-full">
        <thead>
          <tr className="border-b">
            <th className={HEADER_CELL}>Jugador</th>
            {PLAYER_COLUMNS.map((column) => (
              <th key={column.title} title={column.title} className={HEADER_CELL}>
                {column.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr key={player.player_id} className="border-b last:border-0">
              <td className="px-3 py-3 text-lg font-medium">{`${player.dorsal} · ${player.name}`}</td>
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
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table aria-label="Quintetos" className="w-full">
        <thead>
          <tr className="border-b">
            <th className={HEADER_CELL}>Quinteto</th>
            <th className={HEADER_CELL} title="Tiempo juntos en pista">
              Tiempo
            </th>
            <th className={HEADER_CELL} title="Goles a favor y en contra con ese quinteto">
              Goles
            </th>
            <th className={HEADER_CELL} title="Valoración media con estrellas">
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
