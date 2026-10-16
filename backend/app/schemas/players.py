import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.domain.points.callup import PlayerStatus, Position

MAX_NAME_LENGTH = 100
MAX_DORSAL = 99


class PlayerCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=MAX_NAME_LENGTH)
    dorsal: int = Field(ge=0, le=MAX_DORSAL)
    position: Position


class PlayerUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=MAX_NAME_LENGTH)
    dorsal: int | None = Field(default=None, ge=0, le=MAX_DORSAL)
    position: Position | None = None
    status: PlayerStatus | None = None


class PlayerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    dorsal: int
    position: Position
    status: PlayerStatus
    is_active: bool
