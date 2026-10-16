"""Acceso a datos de la plantilla. Las funciones hacen flush; el commit lo decide el endpoint."""

import uuid
from collections.abc import Mapping
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Player

DORSAL_CONSTRAINT = "uq_players_dorsal"


class DuplicateDorsalError(Exception):
    """Ya existe un jugador con ese dorsal."""


async def _flush_checking_dorsal(session: AsyncSession) -> None:
    try:
        await session.flush()
    except IntegrityError as error:
        await session.rollback()
        if DORSAL_CONSTRAINT in str(error.orig):
            raise DuplicateDorsalError from error
        raise


async def list_players(session: AsyncSession, include_inactive: bool = False) -> list[Player]:
    query = select(Player).order_by(Player.dorsal)
    if not include_inactive:
        query = query.where(Player.is_active.is_(True))
    return list((await session.execute(query)).scalars().all())


async def get_player(session: AsyncSession, player_id: uuid.UUID) -> Player | None:
    return await session.get(Player, player_id)


async def create_player(session: AsyncSession, values: Mapping[str, Any]) -> Player:
    player = Player(**values)
    session.add(player)
    await _flush_checking_dorsal(session)
    return player


async def update_player(session: AsyncSession, player: Player, values: Mapping[str, Any]) -> Player:
    for field, value in values.items():
        setattr(player, field, value)
    await _flush_checking_dorsal(session)
    return player
