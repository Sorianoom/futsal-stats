import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field

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


class TokenData(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class LoginData(TokenData):
    user: UserOut


class SessionsRevoked(BaseModel):
    revoked: int
