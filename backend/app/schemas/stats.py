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
    fouls: int
    yellows: int
    reds: int


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
    players: list[PlayerStatsOut]
    quintets: list[QuintetStatsOut]
    warnings: list[str]


class SeasonPlayerStatsOut(PlayerStatsOut):
    matches_played: int


class SeasonStatsOut(BaseModel):
    """Acumulado de todos los partidos cerrados (los que tienen tramos guardados)."""

    matches: int
    players: list[SeasonPlayerStatsOut]
    warnings: list[str]
