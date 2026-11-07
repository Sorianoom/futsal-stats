export type Role = "head_coach" | "assistant_coach" | "player";
export type Position = "field" | "goalkeeper";
export type PlayerStatus = "available" | "injured";

export interface User {
  id: string;
  email: string;
  role: Role;
  /** Ficha del jugador vinculada a la cuenta; null para los entrenadores. */
  player_id: string | null;
}

export interface LoginData {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface Player {
  id: string;
  name: string;
  /** Cómo le llaman en el equipo; si falta, se usa el nombre completo. */
  alias?: string | null;
  dorsal: number;
  position: Position;
  status: PlayerStatus;
  is_active: boolean;
  /** El jugador ya creó su cuenta con una invitación. */
  has_account: boolean;
}

/** Enlace de un solo uso para que un jugador cree su cuenta. */
export interface Invitation {
  token: string;
  expires_at: string;
}

export interface InvitationAcceptance {
  token: string;
  email: string;
  password: string;
}

export interface NewPlayer {
  name: string;
  alias?: string | null;
  dorsal: number;
  position: Position;
}

export type PlayerChanges = Partial<NewPlayer & { status: PlayerStatus }>;

export type SessionKind = "training" | "match" | "physio" | "other";
export type AttendanceStatus = "attended" | "justified" | "unjustified" | "late";
export type WinKind = "exercise" | "scrimmage" | "goalkeeper";
export type Severity = "light" | "serious" | "very_serious";
export type Deferral = "none" | "next_week" | "next_week_if_in_match";
export type SanctionKind = "no_play" | "no_callup";

export interface Sanction {
  kind: SanctionKind;
  min_matches: number;
  max_matches: number;
}

export interface TeamSession {
  id: string;
  kind: SessionKind;
  held_on: string;
  notes: string | null;
}

export interface NewSession {
  kind: SessionKind;
  held_on: string;
  notes: string | null;
}

export interface AttendanceRecord {
  player_id: string;
  status: AttendanceStatus;
  notified: boolean;
  minutes_late: number;
}

export interface AttendanceProposal {
  player_id: string;
  infraction_code: string;
  description: string;
  points: number;
  sanction: Sanction | null;
}

export interface AttendanceSaved {
  saved: number;
  proposals: AttendanceProposal[];
}

export interface Movement {
  id: string;
  player_id: string;
  occurred_on: string;
  points: number;
  reason: string;
  applies_week: string;
  session_id: string | null;
  infraction_code: string | null;
}

export interface MovementsCreated {
  movements: Movement[];
}

export interface NewInfraction {
  player_id: string;
  infraction_code: string;
  occurred_on: string;
  in_match: boolean;
  session_id?: string;
  reason?: string;
}

export interface Escalation {
  infraction_code: string;
  week: string;
  session_id: string | null;
}

export interface InfractionRegistered {
  movement: Movement;
  escalations: Escalation[];
  sanction: Sanction | null;
}

export interface Infraction {
  code: string;
  severity: Severity;
  points: number;
  description: string;
  deferral: Deferral;
  sanction: Sanction | null;
  in_pdf_letter: boolean;
}

export interface RankedPlayer {
  player_id: string;
  name: string;
  dorsal: number;
  position: Position;
  points: number;
  excluded: SanctionKind | null;
}

export interface Selection {
  guaranteed: string[];
  tied: string[];
  open_slots: number;
}

export interface BreakdownItem {
  occurred_on: string;
  points: number;
  reason: string;
  infraction_code: string | null;
  session_id: string | null;
}

export interface Breakdown {
  base: number;
  total: number;
  items: BreakdownItem[];
}

export interface Callup {
  week: string;
  ranking: RankedPlayer[];
  field: Selection;
  goalkeepers: Selection;
  starters: Selection;
  breakdowns: Record<string, Breakdown>;
}

export interface Exclusion {
  id: string;
  player_id: string;
  match_id: string;
  kind: SanctionKind;
}
