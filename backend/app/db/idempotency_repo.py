"""Claves de idempotencia. Las funciones hacen flush; el commit lo decide el endpoint."""

import uuid
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import IdempotencyKeyRow


async def reserve(
    db: AsyncSession, key: uuid.UUID, user_id: uuid.UUID, endpoint: str, request_hash: str
) -> bool:
    """Reserva la clave. False si ya existía (otra petición la usó o la está usando).

    `ON CONFLICT DO NOTHING` hace que dos peticiones simultáneas con la misma clave se
    serialicen: la segunda espera a que la primera confirme y entonces ve la clave ya usada.
    """
    statement = (
        insert(IdempotencyKeyRow)
        .values(key=key, user_id=user_id, endpoint=endpoint, request_hash=request_hash)
        .on_conflict_do_nothing(index_elements=["key"])
        .returning(IdempotencyKeyRow.key)
    )
    return (await db.execute(statement)).scalar_one_or_none() is not None


async def get(db: AsyncSession, key: uuid.UUID) -> IdempotencyKeyRow | None:
    row = (await db.execute(select(IdempotencyKeyRow).where(IdempotencyKeyRow.key == key))).scalar()
    if row is not None:
        # Si otra petición la acaba de confirmar, hay que ver su respuesta, no una copia vieja.
        await db.refresh(row)
    return row


async def store_response(db: AsyncSession, key: uuid.UUID, response: dict[str, Any]) -> None:
    await db.execute(
        update(IdempotencyKeyRow).where(IdempotencyKeyRow.key == key).values(response=response)
    )
    await db.flush()
