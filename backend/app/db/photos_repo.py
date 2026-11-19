"""Fotos de jugadores. Las funciones hacen flush; el commit lo decide el endpoint."""

import uuid
from collections.abc import Iterable

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import PlayerPhoto

PHOTO_PATH = "/player-photos"


def photo_url(token: uuid.UUID) -> str:
    """Ruta pública de la foto, relativa a la raíz de la API."""
    return f"{PHOTO_PATH}/{token}"


async def save_photo(
    session: AsyncSession, player_id: uuid.UUID, content: bytes, content_type: str
) -> PlayerPhoto:
    """Pone o sustituye la foto. Cada foto lleva un token nuevo: el enlace viejo deja de valer."""
    photo = await session.get(PlayerPhoto, player_id)
    if photo is None:
        photo = PlayerPhoto(player_id=player_id)
        session.add(photo)
    photo.token = uuid.uuid4()
    photo.content = content
    photo.content_type = content_type
    await session.flush()
    return photo


async def delete_photo(session: AsyncSession, player_id: uuid.UUID) -> None:
    await session.execute(delete(PlayerPhoto).where(PlayerPhoto.player_id == player_id))
    await session.flush()


async def photo_by_token(session: AsyncSession, token: uuid.UUID) -> PlayerPhoto | None:
    query = select(PlayerPhoto).where(PlayerPhoto.token == token)
    return (await session.execute(query)).scalar_one_or_none()


async def photo_urls(
    session: AsyncSession, player_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, str]:
    """Enlace de la foto de cada jugador que la tiene, en una sola consulta (sin leer los bytes)."""
    ids = list(set(player_ids))
    if not ids:
        return {}
    query = select(PlayerPhoto.player_id, PlayerPhoto.token).where(PlayerPhoto.player_id.in_(ids))
    return {player_id: photo_url(token) for player_id, token in await session.execute(query)}
