"""Traspaso de lo anotado en un partido de un jugador a otro.

Para cuando se apuntó a un jugador en lugar de otro (por ejemplo, el que jugó no salía en el
banquillo): todo lo suyo en ese partido (eventos, alineación, tramos y sanciones) pasa al otro.
El destino no puede aparecer ya en el partido: mezclar a dos jugadores no tiene arreglo.
"""

import uuid
from typing import Any, cast

from sqlalchemy import CursorResult, delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Exclusion,
    LineupEventRow,
    MatchEvent,
    Player,
    QuintetRatingRow,
    StintRow,
)

# Campos de los payloads de alineación que llevan jugadores.
_PLAYER_FIELDS = ("player_out", "player_in", "player_id")


class TransferError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _swap_payload(payload: dict[str, Any], old: str, new: str) -> dict[str, Any] | None:
    """El payload con `old` cambiado por `new`, o None si no lo menciona."""
    changed = dict(payload)
    touched = False
    starters = payload.get("starters")
    if isinstance(starters, list) and old in starters:
        changed["starters"] = [new if p == old else p for p in starters]
        touched = True
    for field in _PLAYER_FIELDS:
        if payload.get(field) == old:
            changed[field] = new
            touched = True
    return changed if touched else None


def _mentions(payload: dict[str, Any], player: str) -> bool:
    starters = payload.get("starters")
    in_starters = isinstance(starters, list) and player in starters
    return in_starters or any(payload.get(f) == player for f in _PLAYER_FIELDS)


async def _appears(
    db: AsyncSession, match_id: uuid.UUID, player_id: uuid.UUID, lineup: list[LineupEventRow]
) -> bool:
    if any(_mentions(row.payload, str(player_id)) for row in lineup):
        return True
    for model in (MatchEvent, StintRow, Exclusion):
        query = select(model.id).where(model.match_id == match_id, model.player_id == player_id)
        if (await db.execute(query.limit(1))).first() is not None:
            return True
    return False


async def transfer_player(
    db: AsyncSession, match_id: uuid.UUID, from_id: uuid.UUID, to_id: uuid.UUID
) -> int:
    """Pasa a `to_id` todo lo de `from_id` en el partido. Devuelve cuántas filas cambió."""
    if from_id == to_id:
        raise TransferError("same_player", "Elige dos jugadores distintos")
    if await db.get(Player, to_id) is None:
        raise TransferError("not_found", "Jugador no encontrado")
    lineup_query = select(LineupEventRow).where(LineupEventRow.match_id == match_id)
    lineup = list((await db.execute(lineup_query)).scalars().all())
    if not await _appears(db, match_id, from_id, lineup):
        raise TransferError("nothing_to_transfer", "Ese jugador no tiene nada en este partido")
    if await _appears(db, match_id, to_id, lineup):
        raise TransferError(
            "player_in_match", "El jugador de destino ya tiene datos en este partido"
        )
    changed = 0
    for row in lineup:
        swapped = _swap_payload(row.payload, str(from_id), str(to_id))
        if swapped is not None:
            row.payload = swapped
            changed += 1
    for model in (MatchEvent, StintRow, Exclusion):
        result = cast(
            CursorResult[Any],
            await db.execute(
                update(model)
                .where(model.match_id == match_id, model.player_id == from_id)
                .values(player_id=to_id)
            ),
        )
        changed += result.rowcount or 0
    await db.commit()
    return changed


async def clear_stats(db: AsyncSession, match_id: uuid.UUID) -> int:
    """Borra todo lo anotado del partido (eventos, alineación, valoraciones y tramos) para
    volver a empezarlo. Las sanciones del reglamento no son estadísticas: se quedan."""
    removed = 0
    for model in (StintRow, QuintetRatingRow, LineupEventRow, MatchEvent):
        result = cast(
            CursorResult[Any], await db.execute(delete(model).where(model.match_id == match_id))
        )
        removed += result.rowcount or 0
    await db.commit()
    return removed
