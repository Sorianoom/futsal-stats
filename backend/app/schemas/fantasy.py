"""Cuerpos y respuestas de las rutas del Fantasy. El dinero va en miles (1000 = 1 M)."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.domain.fantasy.calendar import RoundStatus
from app.domain.points.callup import Position

# Tope de seguridad del cuerpo: más de 4 de campo ya es `invalid_lineup`, pero una lista enorme
# se corta antes en la validación.
MAX_FIELD_IDS_ACCEPTED = 16


class LeagueCreatedOut(BaseModel):
    id: uuid.UUID
    starts_on: date
    participants: int


class LeagueOut(BaseModel):
    id: uuid.UUID
    starts_on: date


class ParticipantOut(BaseModel):
    participant_id: uuid.UUID
    display_name: str
    balance: int


class SquadCopyOut(BaseModel):
    copy_id: uuid.UUID
    player_id: uuid.UUID
    name: str
    dorsal: int
    position: Position
    value: int


class LineupOut(BaseModel):
    goalkeeper_copy_id: uuid.UUID | None
    field_copy_ids: list[uuid.UUID | None]


class LineupIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    goalkeeper_copy_id: uuid.UUID | None = None
    field_copy_ids: list[uuid.UUID | None] = Field(
        default_factory=list, max_length=MAX_FIELD_IDS_ACCEPTED
    )


class NextRoundOut(BaseModel):
    match_id: uuid.UUID
    opponent: str
    held_on: date
    locks_at: datetime


class NoLeagueOut(BaseModel):
    """Respuesta de `GET /fantasy/me` cuando aún no hay liga: solo `league: null`."""

    league: None = None


class MyTeamOut(BaseModel):
    league: LeagueOut
    me: ParticipantOut
    squad: list[SquadCopyOut]
    lineup: LineupOut
    next_round: NextRoundOut | None


class RoundOut(BaseModel):
    match_id: uuid.UUID
    opponent: str
    held_on: date
    status: RoundStatus


class StandingRowOut(BaseModel):
    participant_id: uuid.UUID
    display_name: str
    total: int
    points_by_round: dict[str, int]


class StandingsOut(BaseModel):
    rounds: list[RoundOut]
    rows: list[StandingRowOut]


class SlotOut(BaseModel):
    slot: Position
    copy_id: uuid.UUID | None
    player_id: uuid.UUID | None
    name: str | None
    rating: float | None
    goals: int
    points: int


class RoundDetailOut(BaseModel):
    match_id: uuid.UUID
    status: RoundStatus
    total: int
    slots: list[SlotOut]
