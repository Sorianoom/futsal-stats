"""JWT de acceso (corto) y de refresco (largo). Se valida firma, caducidad, emisor y audiencia."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum

import jwt

from app.config import Settings
from app.domain.roles import Role

ALGORITHM = "HS256"
REQUIRED_CLAIMS = ["sub", "role", "type", "iss", "aud", "iat", "exp"]


class TokenError(Exception):
    """Token ausente, mal formado, caducado o no válido para este uso."""


class TokenType(StrEnum):
    ACCESS = "access"
    REFRESH = "refresh"


@dataclass(frozen=True, slots=True)
class TokenClaims:
    user_id: uuid.UUID
    role: Role
    type: TokenType


def _lifetime(token_type: TokenType, settings: Settings) -> timedelta:
    if token_type is TokenType.ACCESS:
        return timedelta(minutes=settings.access_token_ttl_minutes)
    return timedelta(days=settings.refresh_token_ttl_days)


def create_token(
    user_id: uuid.UUID,
    role: Role,
    token_type: TokenType,
    settings: Settings,
    now: datetime | None = None,
) -> str:
    issued_at = now or datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "role": role.value,
        "type": token_type.value,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": int(issued_at.timestamp()),
        "exp": int((issued_at + _lifetime(token_type, settings)).timestamp()),
    }
    return jwt.encode(payload, settings.require_jwt_secret(), algorithm=ALGORITHM)


def decode_token(token: str, expected_type: TokenType, settings: Settings) -> TokenClaims:
    try:
        payload = jwt.decode(
            token,
            settings.require_jwt_secret(),
            algorithms=[ALGORITHM],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={"require": REQUIRED_CLAIMS},
        )
        claims = TokenClaims(
            user_id=uuid.UUID(payload["sub"]),
            role=Role(payload["role"]),
            type=TokenType(payload["type"]),
        )
    except (jwt.PyJWTError, ValueError) as error:
        raise TokenError("Token no válido") from error
    if claims.type is not expected_type:
        raise TokenError("Tipo de token incorrecto")
    return claims
