"""Qué hacer con un refresco presentado: rotar su sesión o, si es anterior a ellas, adoptarlo."""

import hashlib
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.tokens import TokenClaims
from app.config import Settings
from app.db import refresh_sessions_repo as sessions
from app.db.refresh_sessions_repo import Rotation


def legacy_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def rotate_refresh_token(
    db: AsyncSession, token: str, claims: TokenClaims, settings: Settings, now: datetime
) -> Rotation | None:
    """None si la sesión no vale. El llamador debe confirmar la transacción también entonces."""
    grace = settings.refresh_reuse_grace_seconds
    if claims.jti is not None:
        return await sessions.rotate(db, claims.jti, now, grace)
    # Refresco anterior a las sesiones (sin jti): la primera vez abre su sesión; si ya se adoptó,
    # solo vale dentro de la gracia por si se perdió la respuesta.
    digest = legacy_token_hash(token)
    adopted = await sessions.adopt_legacy(
        db, claims.user_id, digest, now, settings.refresh_session_max_days
    )
    if adopted is not None:
        return adopted
    return await sessions.replay_legacy(db, digest, now, grace)
