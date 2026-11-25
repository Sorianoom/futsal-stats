"""Esquemas del partido en vivo: lote de sincronización, eventos, alineación y tramos."""

import uuid
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain.stints.events import EventKind
from app.domain.stints.goal_detail import (
    COURT_MAX,
    COURT_MIN,
    MAX_GOAL_TAGS,
    GoalDetail,
    GoalDetailError,
    GoalTag,
    validate_goal_detail,
)
from app.schemas.points import StrictModel

MAX_BATCH = 500
MAX_SEQ = 1_000_000
MAX_SECONDS = 7200
MAX_STARTERS = 5

Part = Annotated[int, Field(ge=1, le=2)]
Seconds = Annotated[int, Field(ge=0, le=MAX_SECONDS)]
EVENTS_WITHOUT_PLAYER = (EventKind.RIVAL_GOAL, EventKind.UNDO)
CourtPoint = Annotated[int, Field(ge=COURT_MIN, le=COURT_MAX)]
GoalTags = Annotated[list[GoalTag], Field(max_length=MAX_GOAL_TAGS)]


class GoalDetailIn(StrictModel):
    """Tipos y punto de media pista de un gol; todo opcional."""

    goal_tags: GoalTags = Field(default_factory=list)
    goal_x: CourtPoint | None = None
    goal_y: CourtPoint | None = None

    def detail(self) -> GoalDetail:
        return GoalDetail(tuple(self.goal_tags), self.goal_x, self.goal_y)

    @model_validator(mode="after")
    def _point_complete(self) -> "GoalDetailIn":
        try:
            validate_goal_detail(EventKind.GOAL, self.detail())
        except GoalDetailError as error:
            raise ValueError(str(error)) from error
        return self


class EventIn(StrictModel):
    id: uuid.UUID
    seq: int = Field(ge=0, le=MAX_SEQ)
    kind: EventKind
    part: Part
    t: Seconds
    player_id: uuid.UUID | None = None
    voids_event_id: uuid.UUID | None = None
    goal_tags: GoalTags | None = None
    goal_x: CourtPoint | None = None
    goal_y: CourtPoint | None = None

    @model_validator(mode="after")
    def _coherent(self) -> "EventIn":
        is_undo = self.kind is EventKind.UNDO
        if is_undo != (self.voids_event_id is not None):
            raise ValueError("Solo un 'deshacer' indica qué evento deshace")
        no_player = self.kind in EVENTS_WITHOUT_PLAYER
        if no_player != (self.player_id is None):
            raise ValueError("El jugador es obligatorio salvo en gol rival y deshacer")
        detail = GoalDetail(tuple(self.goal_tags or ()), self.goal_x, self.goal_y)
        try:
            validate_goal_detail(self.kind, detail)
        except GoalDetailError as error:
            raise ValueError(str(error)) from error
        return self


class PartStartedPayload(StrictModel):
    type: Literal["part_started"]
    part: Part
    starters: list[uuid.UUID] = Field(max_length=MAX_STARTERS)


class SubstitutedPayload(StrictModel):
    type: Literal["substituted"]
    t: Seconds
    player_out: uuid.UUID
    player_in: uuid.UUID


class SentOffPayload(StrictModel):
    type: Literal["sent_off"]
    t: Seconds
    player_id: uuid.UUID


class PartEndedPayload(StrictModel):
    type: Literal["part_ended"]
    t: Seconds


class LineupUndoPayload(StrictModel):
    """Deshace el último movimiento de alineación vigente (pila)."""

    type: Literal["undo"]
    voids_event_id: uuid.UUID


LineupPayload = Annotated[
    PartStartedPayload | SubstitutedPayload | SentOffPayload | PartEndedPayload | LineupUndoPayload,
    Field(discriminator="type"),
]


class LineupEventIn(StrictModel):
    id: uuid.UUID
    seq: int = Field(ge=0, le=MAX_SEQ)
    payload: LineupPayload


class RatingIn(StrictModel):
    id: uuid.UUID
    part: Part
    t: Seconds
    stars: int = Field(ge=1, le=5)


class SyncRequest(StrictModel):
    events: list[EventIn] = Field(default_factory=list, max_length=MAX_BATCH)
    lineup_events: list[LineupEventIn] = Field(default_factory=list, max_length=MAX_BATCH)
    ratings: list[RatingIn] = Field(default_factory=list, max_length=MAX_BATCH)


class RejectedItem(BaseModel):
    id: uuid.UUID
    reason: str


class SyncResult(BaseModel):
    accepted: list[uuid.UUID]
    duplicates: list[uuid.UUID]
    rejected: list[RejectedItem]


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    seq: int
    kind: EventKind
    part: int
    t: int
    player_id: uuid.UUID | None
    voids_event_id: uuid.UUID | None
    goal_tags: list[GoalTag] | None = None
    goal_x: int | None = None
    goal_y: int | None = None


class LineupEventOut(BaseModel):
    id: uuid.UUID
    seq: int
    payload: dict[str, Any]


class StreamStatus(BaseModel):
    count: int
    last_seq: int | None


class RatingsStatus(BaseModel):
    count: int


class SyncStatus(BaseModel):
    events: StreamStatus
    lineup_events: StreamStatus
    ratings: RatingsStatus


class StintCreate(StrictModel):
    player_id: uuid.UUID
    part: Part
    start_s: Seconds
    end_s: Seconds

    @model_validator(mode="after")
    def _ends_after_start(self) -> "StintCreate":
        if self.end_s <= self.start_s:
            raise ValueError("El fin debe ser posterior al inicio")
        return self


class StintUpdate(StrictModel):
    part: Part | None = None
    start_s: Seconds | None = None
    end_s: Seconds | None = None


class StintOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    match_id: uuid.UUID
    player_id: uuid.UUID
    part: int
    start_s: int
    end_s: int


class FinalizeResult(BaseModel):
    stints: list[StintOut]
    seconds_by_player: dict[uuid.UUID, int]


class PlayerTransferIn(StrictModel):
    from_player_id: uuid.UUID
    to_player_id: uuid.UUID


class PlayerTransferOut(BaseModel):
    # Filas cambiadas (eventos, alineación, tramos y sanciones).
    changed: int
