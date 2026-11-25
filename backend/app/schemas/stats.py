"""Respuestas de estadísticas de un partido."""

import uuid

from pydantic import BaseModel


class ScoreOut(BaseModel):
    goals_for: int
    goals_against: int


class TeamFoulsOut(BaseModel):
    part: int
    fouls: int


class PlayerStatsOut(BaseModel):
    player_id: uuid.UUID
    name: str
    dorsal: int
    seconds: int
    goals: int
    assists: int
    shots: int
    turnovers: int
    steals: int
    key_actions: int
    fouls: int
    yellows: int
    reds: int
    saves: int


class MatchPlayerStatsOut(PlayerStatsOut):
    """Fila de un partido: añade la nota, que solo tiene sentido partido a partido."""

    # Nota de 1 a 10; None si el partido no está cerrado o jugó menos de 3 minutos.
    rating: float | None
    # Puntuación exacta, sin tope ni redondeo: la que usa el Fantasy. None igual que `rating`.
    score: float | None = None


class QuintetStatsOut(BaseModel):
    player_ids: list[uuid.UUID]
    seconds: int
    goals_for: int
    goals_against: int
    rating_count: int
    rating_average: float | None


class MatchStatsOut(BaseModel):
    match_id: uuid.UUID
    """False mientras no se haya cerrado el partido: hay acciones pero no minutos ni quintetos."""
    closed: bool
    score: ScoreOut
    team_fouls: list[TeamFoulsOut]
    players: list[MatchPlayerStatsOut]
    quintets: list[QuintetStatsOut]
    warnings: list[str]


class SeasonPlayerStatsOut(PlayerStatsOut):
    matches_played: int


class SeasonStatsOut(BaseModel):
    """Acumulado de todos los partidos cerrados (los que tienen tramos guardados)."""

    matches: int
    players: list[SeasonPlayerStatsOut]
    warnings: list[str]
