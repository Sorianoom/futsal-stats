"""Sesiones de refresco. Las funciones hacen flush; el commit lo decide el endpoint.

`rotate` devuelve None cuando la sesión no vale, también tras revocarla por reutilización: el
endpoint debe confirmar la transacción en ambos casos para que esa revocación no se pierda.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import ColumnElement, delete, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import RefreshSession
from app.domain.auth_sessions import RevokeReason

# Cuánto se guarda una sesión tras su tope antes de borrarla. Ningún refresco vale después del
# tope (su `exp` nunca lo supera), pero `decode_token` admite unos segundos de desfase de reloj y
# cada instancia usa su propio reloj: con este margen la fila sigue ahí mientras el último token
# pueda decodificarse, así que un refresco antiguo sin `jti` nunca encuentra su sesión borrada y
# la vuelve a adoptar como nueva. Un día sobra frente a segundos y no pesa en la tabla.
EXPIRED_SESSION_RETENTION = timedelta(days=1)


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


async def _lock_one(db: AsyncSession, condition: ColumnElement[bool]) -> RefreshSession | None:
    row = (
        await db.execute(select(RefreshSession).where(condition).with_for_update())
    ).scalar_one_or_none()
    if row is not None:
        await db.refresh(row)  # con el bloqueo tomado, ver lo que confirmó la petición anterior
    return row


async def _lock_by_jti(db: AsyncSession, jti: uuid.UUID) -> RefreshSession | None:
    return await _lock_one(
        db, or_(RefreshSession.current_jti == jti, RefreshSession.previous_jti == jti)
    )


async def replay_legacy(
    db: AsyncSession, token_hash: str, now: datetime, grace_seconds: int
) -> Rotation | None:
    """Un refresco anterior a las sesiones que ya se adoptó vuelve a presentarse.

    Dentro de la gracia desde la adopción se acepta (la respuesta con la cookie nueva pudo
    perderse) y se reenvía el `jti` vigente. Pasada la gracia es una reutilización: se revoca.
    """
    row = await _lock_one(db, RefreshSession.legacy_token_hash == token_hash)
    if row is None or not _is_usable(row, now):
        return None
    if now - row.created_at <= timedelta(seconds=grace_seconds):
        return Rotation(row, row.current_jti)
    _revoke_row(row, RevokeReason.REUSE, now)
    await db.flush()
    return None


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


async def revoke_all_for_user(db: AsyncSession, user_id: uuid.UUID, now: datetime) -> int:
    """Cierra por orden administrativa todas las sesiones abiertas del usuario. Devuelve cuántas.

    Las que ya estaban cerradas conservan su motivo.
    """
    statement = (
        update(RefreshSession)
        .where(RefreshSession.user_id == user_id, RefreshSession.revoked_at.is_(None))
        .values(revoked_at=now, revoke_reason=RevokeReason.ADMIN)
        .returning(RefreshSession.id)
    )
    closed = (await db.execute(statement)).scalars().all()
    await db.flush()
    return len(closed)


async def revoke(db: AsyncSession, jti: uuid.UUID, reason: RevokeReason, now: datetime) -> None:
    """Cierra la sesión del jti. Si ya estaba cerrada conserva el primer motivo."""
    row = await _lock_by_jti(db, jti)
    if row is None:
        return
    _revoke_row(row, reason, now)
    await db.flush()


async def delete_expired(db: AsyncSession, now: datetime) -> int:
    """Borra las sesiones que pasaron su tope (más el margen), revocadas o no. Devuelve cuántas.

    Una revocada antes del tope se conserva: la detección por reutilización necesita su fila
    mientras el refresco robado aún pueda presentarse.
    """
    statement = (
        delete(RefreshSession)
        .where(RefreshSession.absolute_expires_at < now - EXPIRED_SESSION_RETENTION)
        .returning(RefreshSession.id)
    )
    deleted = (await db.execute(statement)).scalars().all()
    await db.flush()
    return len(deleted)
