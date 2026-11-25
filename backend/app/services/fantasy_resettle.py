"""Fantasy: volver a cerrar una jornada ya cerrada con las reglas y los datos actuales.

Deshace lo que hizo su cierre (cobros por punto, cambios de valor y puntos congelados) y la cierra
de nuevo: alineaciones, propiedad y saldo en el bloqueo (el inicio del partido) y puntuación
actual. Solo la última jornada cerrada: los valores de las siguientes partirían de los de esta.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import fantasy_repo
from app.db.models import (
    FantasyLedgerEntry,
    FantasyParticipant,
    FantasyPlayerValue,
    FantasyRoundScore,
    FantasySettledRound,
    FantasyValueChange,
)
from app.domain.fantasy.market import LedgerKind
from app.domain.fantasy.standings import display_name
from app.services.fantasy_results import rounds_of, scored_results
from app.services.fantasy_settlement import settle_round


class ResettleError(ValueError):
    """La jornada no se puede volver a cerrar."""


@dataclass(frozen=True, slots=True)
class ParticipantChange:
    name: str
    points_before: int
    points_after: int
    payout_before: int
    payout_after: int


async def _frozen_points(
    db: AsyncSession, league_id: uuid.UUID, match_id: uuid.UUID
) -> dict[uuid.UUID, tuple[int, int]]:
    query = select(
        FantasyRoundScore.participant_id, FantasyRoundScore.points, FantasyRoundScore.payout
    ).where(FantasyRoundScore.league_id == league_id, FantasyRoundScore.match_id == match_id)
    return {pid: (points, payout) for pid, points, payout in (await db.execute(query)).all()}


async def _undo_payouts(
    db: AsyncSession, frozen: dict[uuid.UUID, tuple[int, int]], settled_at: datetime
) -> None:
    """Quita del saldo y del historial el cobro por punto de cada participante."""
    for participant_id, (_, payout) in frozen.items():
        if payout == 0:
            continue
        entry = (
            select(FantasyLedgerEntry.id)
            .where(
                FantasyLedgerEntry.participant_id == participant_id,
                FantasyLedgerEntry.kind == LedgerKind.ROUND_PAYOUT,
                FantasyLedgerEntry.at == settled_at,
                FantasyLedgerEntry.amount == payout,
            )
            .limit(1)
            .scalar_subquery()
        )
        removed = await db.scalar(
            delete(FantasyLedgerEntry)
            .where(FantasyLedgerEntry.id == entry)
            .returning(FantasyLedgerEntry.id)
        )
        if removed is None:
            raise ResettleError(f"No se encuentra el cobro de {participant_id}")
        await db.execute(
            update(FantasyParticipant)
            .where(FantasyParticipant.id == participant_id)
            .values(balance=FantasyParticipant.balance - payout)
        )


async def _undo_values(db: AsyncSession, league_id: uuid.UUID, match_id: uuid.UUID) -> None:
    """Devuelve a cada jugador el valor que perdió o ganó en la jornada."""
    query = select(
        FantasyValueChange.player_id, FantasyValueChange.before, FantasyValueChange.after
    ).where(FantasyValueChange.league_id == league_id, FantasyValueChange.match_id == match_id)
    for player_id, before, after in (await db.execute(query)).all():
        await db.execute(
            update(FantasyPlayerValue)
            .where(
                FantasyPlayerValue.league_id == league_id,
                FantasyPlayerValue.player_id == player_id,
            )
            .values(value=FantasyPlayerValue.value - (after - before))
        )


async def resettle_round(
    db: AsyncSession, match_id: uuid.UUID, now: datetime
) -> list[ParticipantChange]:
    """Vuelve a cerrar la jornada de `match_id` en la liga activa. No confirma la transacción:
    el que llama decide (y puede deshacerla para un simulacro)."""
    league = await fantasy_repo.get_active_league(db, for_update=True)
    if league is None:
        raise ResettleError("No hay liga activa")
    rounds = await rounds_of(db, league)
    round_ = next((r for r in rounds if r.match_id == str(match_id)), None)
    if round_ is None:
        raise ResettleError("Ese partido no es una jornada de la liga")
    settled = await db.get(FantasySettledRound, (league.id, match_id))
    if settled is None:
        raise ResettleError("La jornada aún no está cerrada")
    for later in (r for r in rounds if r.held_on > round_.held_on):
        if await db.get(FantasySettledRound, (league.id, uuid.UUID(later.match_id))):
            raise ResettleError("Hay jornadas posteriores cerradas: solo se puede la última")
    results = (await scored_results(db, [round_], now)).get(round_.match_id)
    if results is None:
        raise ResettleError("El partido no está cerrado o tiene eventos incoherentes")

    before = await _frozen_points(db, league.id, match_id)
    await _undo_payouts(db, before, settled.settled_at)
    await _undo_values(db, league.id, match_id)
    await db.execute(
        delete(FantasySettledRound).where(
            FantasySettledRound.league_id == league.id, FantasySettledRound.match_id == match_id
        )
    )
    await db.flush()
    db.expunge(settled)
    await settle_round(db, league, round_, results)
    after = await _frozen_points(db, league.id, match_id)
    names = {
        p.participant.id: display_name(p.user_name, p.player_name, p.email)
        for p in await fantasy_repo.list_participants(db, league.id)
    }
    return [
        ParticipantChange(
            names.get(pid, str(pid)),
            before.get(pid, (0, 0))[0],
            after.get(pid, (0, 0))[0],
            before.get(pid, (0, 0))[1],
            after.get(pid, (0, 0))[1],
        )
        for pid in sorted(before.keys() | after.keys(), key=lambda p: names.get(p, str(p)))
    ]
