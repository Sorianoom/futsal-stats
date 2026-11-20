"""Cuentas del Fantasy del cuerpo técnico: solo para jugar, con la plantilla privada."""

import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.auth import MAX_DISPLAY_NAME_LENGTH


class FantasyAccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    display_name: str | None


class FantasyInvitationIn(BaseModel):
    """Nombre con el que saldrá en la clasificación (lo puede cambiar luego desde el Fantasy)."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    display_name: str = Field(min_length=1, max_length=MAX_DISPLAY_NAME_LENGTH)
