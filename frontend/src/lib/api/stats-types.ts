export interface PlayerStats {
  player_id: string;
  name: string;
  dorsal: number;
  seconds: number;
  goals: number;
  assists: number;
  shots: number;
  turnovers: number;
  steals: number;
  fouls: number;
  yellows: number;
  reds: number;
}

export interface QuintetStats {
  player_ids: string[];
  seconds: number;
  goals_for: number;
  goals_against: number;
  rating_count: number;
  rating_average: number | null;
}

export interface MatchStats {
  match_id: string;
  /** False mientras el partido no se haya cerrado: hay acciones pero no minutos ni quintetos. */
  closed: boolean;
  score: { goals_for: number; goals_against: number };
  team_fouls: { part: number; fouls: number }[];
  players: PlayerStats[];
  quintets: QuintetStats[];
  warnings: string[];
}

export interface SeasonPlayerStats extends PlayerStats {
  /** Partidos en los que estuvo en pista algún segundo. */
  matches_played: number;
}

/** Acumulado de todos los partidos cerrados. */
export interface SeasonStats {
  matches: number;
  players: SeasonPlayerStats[];
  warnings: string[];
}
