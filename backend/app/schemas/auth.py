import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.auth.invitations import MAX_TOKEN_LENGTH
from app.auth.passwords import MAX_PASSWORD_LENGTH
from app.domain.roles import Role


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=1, max_length=MAX_PASSWORD_LENGTH)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    role: Role
    player_id: uuid.UUID | None
    display_name: str | None


MAX_DISPLAY_NAME_LENGTH = 40


class DisplayNameUpdate(BaseModel):
    """`null` quita el nombre (se vuelve a usar la parte del email antes de `@`)."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    display_name: str | None = Field(min_length=1, max_length=MAX_DISPLAY_NAME_LENGTH)


class InvitationAccept(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=1, max_length=MAX_TOKEN_LENGTH)
    email: EmailStr
    # Sin mínimo aquí: la longitud mínima la comprueba `validate_password` (422 `weak_password`).
    password: str = Field(min_length=1, max_length=MAX_PASSWORD_LENGTH)


class TokenData(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class LoginData(TokenData):
    user: UserOut


class SessionsRevoked(BaseModel):
    revoked: int
