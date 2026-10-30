"""Sesiones de refresco. Las funciones hacen flush; el commit lo decide el endpoint.

`rotate` devuelve None cuando la sesión no vale, también tras revocarla por reutilización: el
endpoint debe confirmar la transacción en ambos casos para que esa revocación no se pierda.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import RefreshSession
from app.domain.auth_sessions import RevokeReason


@dataclass(frozen=True, slots=True)
class Rotation:
    """Sesión y `jti` con el que hay que firmar el refresco que se entrega."""

    session: RefreshSession
    jti: uuid.UUID


async def create_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    now: datetime,
    max_days: int,
    legacy_token_hash: str | None = None,
) -> RefreshSession:
    row = RefreshSession(
        user_id=user_id,
        current_jti=uuid.uuid4(),
        created_at=now,
        last_used_at=now,
        absolute_expires_at=now + timedelta(days=max_days),
        legacy_token_hash=legacy_token_hash,
    )
    db.add(row)
    await db.flush()
    return row


async def adopt_legacy(
    db: AsyncSession, user_id: uuid.UUID, token_hash: str, now: datetime, max_days: int
) -> Rotation | None:
    """Crea la sesión de un refresco anterior a las sesiones. None si ya se había adoptado.

    `ON CONFLICT DO NOTHING` serializa dos adopciones simultáneas: solo una crea la sesión.
    """
    statement = (
        insert(RefreshSession)
        .values(
            user_id=user_id,
            current_jti=uuid.uuid4(),
            created_at=now,
            last_used_at=now,
            absolute_expires_at=now + timedelta(days=max_days),
            legacy_token_hash=token_hash,
        )
        .on_conflict_do_nothing(index_elements=["legacy_token_hash"])
        .returning(RefreshSession.id)
    )
    session_id = (await db.execute(statement)).scalar_one_or_none()
    if session_id is None:
        return None
    row = await db.get(RefreshSession, session_id)
    assert row is not None
    return Rotation(row, row.current_jti)


async def _lock_by_jti(db: AsyncSession, jti: uuid.UUID) -> RefreshSession | None:
    query = (
        select(RefreshSession)
        .where(or_(RefreshSession.current_jti == jti, RefreshSession.previous_jti == jti))
        .with_for_update()
    )
    row = (await db.execute(query)).scalar_one_or_none()
    if row is not None:
        await db.refresh(row)  # con el bloqueo tomado, ver lo que confirmó la petición anterior
    return row


def _is_usable(row: RefreshSession, now: datetime) -> bool:
    return row.revoked_at is None and now < row.absolute_expires_at


async def rotate(
    db: AsyncSession, jti: uuid.UUID, now: datetime, grace_seconds: int
) -> Rotation | None:
    row = await _lock_by_jti(db, jti)
    if row is None or not _is_usable(row, now):
        return None
    if row.current_jti == jti:
        row.previous_jti, row.current_jti = row.current_jti, uuid.uuid4()
        row.rotated_at = now
        row.last_used_at = now
        await db.flush()
        return Rotation(row, row.current_jti)
    # Es el jti anterior: válido solo mientras dure la gracia (la respuesta con el nuevo se perdió).
    assert row.rotated_at is not None
    if now - row.rotated_at <= timedelta(seconds=grace_seconds):
        return Rotation(row, row.current_jti)
    _revoke_row(row, RevokeReason.REUSE, now)
    await db.flush()
    return None


def _revoke_row(row: RefreshSession, reason: RevokeReason, now: datetime) -> None:
    if row.revoked_at is None:
        row.revoked_at = now
        row.revoke_reason = reason


async def revoke(db: AsyncSession, jti: uuid.UUID, reason: RevokeReason, now: datetime) -> None:
    """Cierra la sesión del jti. Si ya estaba cerrada conserva el primer motivo."""
    row = await _lock_by_jti(db, jti)
    if row is None:
        return
    _revoke_row(row, reason, now)
    await db.flush()
