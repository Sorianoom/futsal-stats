import { apiData } from "./client";
import type {
  AttendanceRecord,
  AttendanceSaved,
  Callup,
  Exclusion,
  Infraction,
  InfractionRegistered,
  Movement,
  MovementsCreated,
  NewInfraction,
  NewSession,
  SanctionKind,
  TeamSession,
  WinKind,
} from "./types";

export function getCallup(week: string, matchId?: string): Promise<Callup> {
  const match = matchId ? `&match_id=${encodeURIComponent(matchId)}` : "";
  return apiData<Callup>(`/callup?week=${week}${match}`);
}

export function listSessions(week: string): Promise<TeamSession[]> {
  return apiData<TeamSession[]>(`/sessions?week=${week}`);
}

export function createSession(session: NewSession): Promise<TeamSession> {
  return apiData<TeamSession>("/sessions", { method: "POST", body: session });
}

export function getAttendance(sessionId: string): Promise<AttendanceRecord[]> {
  return apiData<AttendanceRecord[]>(`/sessions/${sessionId}/attendance`);
}

export function saveAttendance(
  sessionId: string,
  records: AttendanceRecord[],
): Promise<AttendanceSaved> {
  return apiData<AttendanceSaved>(`/sessions/${sessionId}/attendance`, {
    method: "PUT",
    body: { records },
  });
}

export function registerWins(
  sessionId: string,
  kind: WinKind,
  playerIds: string[],
): Promise<MovementsCreated> {
  return apiData<MovementsCreated>(`/sessions/${sessionId}/wins`, {
    method: "POST",
    body: { kind, player_ids: playerIds },
  });
}

export function listMovements(week: string, playerId?: string): Promise<Movement[]> {
  const player = playerId ? `&player_id=${encodeURIComponent(playerId)}` : "";
  return apiData<Movement[]>(`/movements?week=${week}${player}`);
}

export function registerInfraction(infraction: NewInfraction): Promise<InfractionRegistered> {
  return apiData<InfractionRegistered>("/movements/infractions", {
    method: "POST",
    body: infraction,
  });
}

export function deleteMovement(movementId: string): Promise<Movement> {
  return apiData<Movement>(`/movements/${movementId}`, { method: "DELETE" });
}

export function listInfractions(): Promise<Infraction[]> {
  return apiData<Infraction[]>("/catalog/infractions");
}

/** Confirma una sanción propuesta: el jugador queda excluido de ese partido. */
export function createExclusion(
  playerId: string,
  matchId: string,
  kind: SanctionKind,
): Promise<Exclusion> {
  return apiData<Exclusion>("/exclusions", {
    method: "POST",
    body: { player_id: playerId, match_id: matchId, kind },
  });
}

/** Exclusiones ya confirmadas para un partido. */
export function listExclusions(matchId: string): Promise<Exclusion[]> {
  return apiData<Exclusion[]>(`/exclusions?match_id=${encodeURIComponent(matchId)}`);
}
