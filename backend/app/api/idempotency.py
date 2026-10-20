"""Idempotencia de las altas: con `Idempotency-Key` repetir una petición no repite sus efectos.

El cliente genera una clave por intención (y la reutiliza al reintentar). La clave se reserva en
la misma transacción que el alta y guarda la respuesta, así que o ocurre todo o no ocurre nada.
Si la petición falla, la clave no se consume y se puede reintentar.
"""

import hashlib
import uuid
from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.envelope import Envelope, ok
from app.api.errors import ApiError
from app.db import idempotency_repo
from app.db.models import User

IDEMPOTENCY_HEADER = "Idempotency-Key"


def idempotency_key(request: Request) -> uuid.UUID | None:
    raw = request.headers.get(IDEMPOTENCY_HEADER)
    if raw is None:
        return None
    try:
        return uuid.UUID(raw)
    except ValueError as error:
        raise ApiError(
            422, "invalid_idempotency_key", "Idempotency-Key debe ser un UUID"
        ) from error


IdempotencyKey = Annotated[uuid.UUID | None, Depends(idempotency_key)]


def _fingerprint(endpoint: str, payload: BaseModel | None) -> str:
    body = payload.model_dump_json() if payload is not None else ""
    return hashlib.sha256(f"{endpoint}\n{body}".encode()).hexdigest()


async def run_idempotent[T: BaseModel](
    db: AsyncSession,
    key: uuid.UUID | None,
    user: User,
    endpoint: str,
    payload: BaseModel | None,
    response_type: type[T],
    action: Callable[[], Awaitable[T]],
) -> Envelope[T]:
    """Ejecuta `action` (solo hace flush) y confirma; con clave repetida devuelve lo guardado."""
    if key is None:
        plain = await action()
        await db.commit()
        return ok(plain)

    fingerprint = _fingerprint(endpoint, payload)
    result: T | None = None
    # SAVEPOINT: si el alta falla se deshace también la reserva y la clave no se consume.
    async with db.begin_nested():
        if await idempotency_repo.reserve(db, key, user.id, endpoint, fingerprint):
            result = await action()
            await idempotency_repo.store_response(db, key, result.model_dump(mode="json"))
    if result is None:
        return await _replay(db, key, user, endpoint, fingerprint, response_type)
    await db.commit()
    return ok(result)


async def _replay[T: BaseModel](
    db: AsyncSession,
    key: uuid.UUID,
    user: User,
    endpoint: str,
    fingerprint: str,
    response_type: type[T],
) -> Envelope[T]:
    stored = await idempotency_repo.get(db, key)
    reused = (
        stored is None
        or stored.user_id != user.id
        or stored.endpoint != endpoint
        or stored.request_hash != fingerprint
    )
    if reused:
        raise ApiError(
            422,
            "idempotency_key_reused",
            "Esa clave de idempotencia ya se usó con otra petición",
        )
    if stored is None or stored.response is None:
        raise ApiError(409, "conflict", "La petición original sigue en curso; vuelve a intentarlo")
    return ok(response_type.model_validate(stored.response))
