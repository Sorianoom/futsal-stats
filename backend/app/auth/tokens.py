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
# Los relojes de dos instancias (o un salto del reloj) pueden diferir unos segundos: sin tolerancia,
# un token recién emitido se rechazaba como "emitido en el futuro".
CLOCK_SKEW_SECONDS = 10


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
    jti: uuid.UUID | None = None  # solo los refrescos de una sesión lo llevan


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
    jti: uuid.UUID | None = None,
    expires_cap: datetime | None = None,
) -> str:
    """`expires_cap` acota la caducidad (tope absoluto de la sesión); nunca la alarga."""
    issued_at = now or datetime.now(UTC)
    expires_at = issued_at + _lifetime(token_type, settings)
    if expires_cap is not None:
        expires_at = min(expires_at, expires_cap)
    payload: dict[str, object] = {
        "sub": str(user_id),
        "role": role.value,
        "type": token_type.value,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    if jti is not None:
        payload["jti"] = str(jti)
    return jwt.encode(payload, settings.require_jwt_secret(), algorithm=ALGORITHM)


def decode_token(token: str, expected_type: TokenType, settings: Settings) -> TokenClaims:
    try:
        payload = jwt.decode(
            token,
            settings.require_jwt_secret(),
            algorithms=[ALGORITHM],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            leeway=CLOCK_SKEW_SECONDS,
            options={"require": REQUIRED_CLAIMS},
        )
        claims = TokenClaims(
            user_id=uuid.UUID(payload["sub"]),
            role=Role(payload["role"]),
            type=TokenType(payload["type"]),
            jti=uuid.UUID(payload["jti"]) if "jti" in payload else None,
        )
    except (jwt.PyJWTError, ValueError) as error:
        raise TokenError("Token no válido") from error
    if claims.type is not expected_type:
        raise TokenError("Tipo de token incorrecto")
    return claims
