"""Intentos de login fallidos, compartidos por todas las instancias de la API."""

from collections.abc import Collection
from datetime import datetime

from sqlalchemy import delete, func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import LoginFailure


async def count_failures_since(
    db: AsyncSession, key_hashes: Collection[str], since: datetime
) -> dict[str, int]:
    """Fallos de cada clave desde `since`. Las claves sin fallos no aparecen."""
    if not key_hashes:
        return {}
    query = (
        select(LoginFailure.key_hash, func.count())
        .where(LoginFailure.key_hash.in_(key_hashes), LoginFailure.failed_at >= since)
        .group_by(LoginFailure.key_hash)
    )
    return {key: count for key, count in (await db.execute(query)).all()}


async def record_failures(
    db: AsyncSession, key_hashes: Collection[str], now: datetime, forget_before: datetime
) -> None:
    """Anota un fallo en cada clave y olvida los de cualquier clave anteriores a `forget_before`.

    La limpieza va aquí para que la tabla no crezca: solo hay filas nuevas cuando alguien falla.
    """
    await db.execute(delete(LoginFailure).where(LoginFailure.failed_at < forget_before))
    if key_hashes:
        await db.execute(
            insert(LoginFailure), [{"key_hash": key, "failed_at": now} for key in key_hashes]
        )
    await db.flush()


async def clear_failures(db: AsyncSession, key_hashes: Collection[str]) -> None:
    if not key_hashes:
        return
    await db.execute(delete(LoginFailure).where(LoginFailure.key_hash.in_(key_hashes)))
    await db.flush()
