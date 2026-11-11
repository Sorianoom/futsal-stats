"""Cuerpos y respuestas de las rutas de puntos, sesiones, partidos y convocatoria."""

import uuid
from datetime import date, timedelta
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator

from app.domain.points.attendance import AttendanceStatus, SessionKind
from app.domain.points.callup import Position
from app.domain.points.catalog import Deferral, SanctionKind, Severity
from app.domain.points.training import WinKind

MONDAY = 0
MAX_NOTES_LENGTH = 300
MAX_OPPONENT_LENGTH = 100
MAX_MINUTES_LATE = 300
MAX_WINNERS = 30


# Fechas razonables para un club que empezó a usar la app en 2026: sin esto se aceptaban años como
# 0001 o 9999 y se podían crear movimientos con fechas absurdas. El mínimo es fijo (no relativo a
# hoy) para que los datos y las pruebas antiguas no caduquen con el tiempo.
MIN_DATE = date(2020, 1, 1)
MAX_DAYS_AHEAD = 366


def _check_plausible(day: date) -> date:
    if day < MIN_DATE or day > date.today() + timedelta(days=MAX_DAYS_AHEAD):
        raise ValueError("Fecha fuera de un rango razonable")
    return day


def _check_monday(day: date) -> date:
    if day.weekday() != MONDAY:
        raise ValueError("La semana debe empezar en lunes")
    return day


PlausibleDate = Annotated[date, AfterValidator(_check_plausible)]
WeekStart = Annotated[PlausibleDate, AfterValidator(_check_monday)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class SanctionOut(BaseModel):
    kind: SanctionKind
    min_matches: int
    max_matches: int


class SessionCreate(StrictModel):
    kind: SessionKind
    held_on: PlausibleDate
    notes: str | None = Field(default=None, max_length=MAX_NOTES_LENGTH)


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: SessionKind
    held_on: date
    notes: str | None


class AttendanceRecordIn(StrictModel):
    player_id: uuid.UUID
    status: AttendanceStatus
    notified: bool = False
    minutes_late: int = Field(default=0, ge=0, le=MAX_MINUTES_LATE)


class AttendanceSave(StrictModel):
    records: list[AttendanceRecordIn] = Field(max_length=MAX_WINNERS)

    @model_validator(mode="after")
    def _no_repeated_players(self) -> "AttendanceSave":
        ids = [record.player_id for record in self.records]
        if len(ids) != len(set(ids)):
            raise ValueError("Un jugador aparece más de una vez")
        return self


class AttendanceRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    player_id: uuid.UUID
    status: AttendanceStatus
    notified: bool
    minutes_late: int


class AttendanceProposalOut(BaseModel):
    player_id: uuid.UUID
    infraction_code: str
    description: str
    points: int
    sanction: SanctionOut | None


class AttendanceSaved(BaseModel):
    saved: int
    proposals: list[AttendanceProposalOut]


class WinsIn(StrictModel):
    kind: WinKind
    player_ids: list[uuid.UUID] = Field(max_length=MAX_WINNERS)


class MovementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    player_id: uuid.UUID
    occurred_on: date
    points: int
    reason: str
    applies_week: date
    session_id: uuid.UUID | None
    infraction_code: str | None


class MovementsCreated(BaseModel):
    movements: list[MovementOut]


class InfractionIn(StrictModel):
    player_id: uuid.UUID
    infraction_code: str = Field(min_length=1, max_length=16)
    occurred_on: PlausibleDate
    session_id: uuid.UUID | None = None
    in_match: bool = False
    reason: str | None = Field(default=None, min_length=1, max_length=MAX_NOTES_LENGTH)


class EscalationOut(BaseModel):
    infraction_code: str
    week: date
    session_id: str | None


class InfractionRegistered(BaseModel):
    movement: MovementOut
    escalations: list[EscalationOut]
    sanction: SanctionOut | None


class InfractionOut(BaseModel):
    code: str
    severity: Severity
    points: int
    description: str
    deferral: Deferral
    sanction: SanctionOut | None
    in_pdf_letter: bool


class MatchCreate(StrictModel):
    held_on: PlausibleDate
    opponent: str = Field(min_length=1, max_length=MAX_OPPONENT_LENGTH)
    is_official: bool = True


class MatchUpdate(StrictModel):
    is_official: bool


class MatchOut(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    held_on: date
    opponent: str
    # Con valor por defecto para repetir respuestas idempotentes guardadas antes de existir.
    is_official: bool = True


class ExclusionCreate(StrictModel):
    player_id: uuid.UUID
    match_id: uuid.UUID
    kind: SanctionKind


class ExclusionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    player_id: uuid.UUID
    match_id: uuid.UUID
    kind: SanctionKind


class RankedPlayerOut(BaseModel):
    player_id: uuid.UUID
    name: str
    dorsal: int
    position: Position
    points: int
    excluded: SanctionKind | None


class SelectionOut(BaseModel):
    guaranteed: list[uuid.UUID]
    tied: list[uuid.UUID]
    open_slots: int


class BreakdownItemOut(BaseModel):
    occurred_on: date
    points: int
    reason: str
    infraction_code: str | None
    session_id: str | None


class BreakdownOut(BaseModel):
    base: int
    total: int
    items: list[BreakdownItemOut]


class CallupOut(BaseModel):
    week: date
    ranking: list[RankedPlayerOut]
    field: SelectionOut
    goalkeepers: SelectionOut
    starters: SelectionOut
    breakdowns: dict[uuid.UUID, BreakdownOut]
