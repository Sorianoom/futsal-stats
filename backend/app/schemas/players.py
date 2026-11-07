import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.domain.points.callup import PlayerStatus, Position

MAX_NAME_LENGTH = 100
MAX_ALIAS_LENGTH = 30
MAX_DORSAL = 99


class PlayerCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=MAX_NAME_LENGTH)
    alias: str | None = Field(default=None, min_length=1, max_length=MAX_ALIAS_LENGTH)
    dorsal: int = Field(ge=0, le=MAX_DORSAL)
    position: Position


class PlayerUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=MAX_NAME_LENGTH)
    # `null` borra el alias; si no se envía, no cambia.
    alias: str | None = Field(default=None, min_length=1, max_length=MAX_ALIAS_LENGTH)
    dorsal: int | None = Field(default=None, ge=0, le=MAX_DORSAL)
    position: Position | None = None
    status: PlayerStatus | None = None


class PlayerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    alias: str | None
    dorsal: int
    position: Position
    status: PlayerStatus
    is_active: bool
    # Hay un usuario activo vinculado al jugador.
    has_account: bool


class InvitationOut(BaseModel):
    token: str
    expires_at: datetime
