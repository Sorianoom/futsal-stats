"""Acceso a datos del dinero del Fantasy: valores de los jugadores, traspasos (historial de
propiedad), movimientos del saldo y jornadas cerradas.

Las funciones hacen flush; el commit lo decide quien llama. Las escrituras de saldo y propiedad
se hacen con la fila de la liga bloqueada (`fantasy_repo.lock_league`).
"""

import uuid
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from sqlalchemy import exists, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    FantasyCopy,
    FantasyLedgerEntry,
    FantasyParticipant,
    FantasyPlayerValue,
    FantasyRoundScore,
    FantasySettledRound,
    FantasyTransfer,
    FantasyValueChange,
    Match,
    Player,
    StintRow,
    TeamSession,
)
from app.domain.fantasy.clauses import clause_after_purchase
from app.domain.fantasy.market import LedgerKind, TransferKind
from app.domain.fantasy.rules import INITIAL_PLAYER_VALUE
from app.domain.fantasy.settlement import LedgerEntry, Transfer

# --- Valores -------------------------------------------------------------------------------------


async def add_player_values(
    db: AsyncSession, league_id: uuid.UUID, player_ids: Iterable[str]
) -> None:
    """Valor inicial de los jugadores que aún no lo tienen (los que ya lo tienen no cambian)."""
    rows = [
        {"league_id": league_id, "player_id": uuid.UUID(p), "value": INITIAL_PLAYER_VALUE}
        for p in set(player_ids)
    ]
    if rows:
        await db.execute(insert(FantasyPlayerValue).values(rows).on_conflict_do_nothing())


async def player_values(db: AsyncSession, league_id: uuid.UUID) -> dict[str, int]:
    query = select(FantasyPlayerValue.player_id, FantasyPlayerValue.value).where(
        FantasyPlayerValue.league_id == league_id
    )
    return {str(pid): value for pid, value in (await db.execute(query)).all()}


async def player_value(db: AsyncSession, league_id: uuid.UUID, player_id: uuid.UUID) -> int:
    query = select(FantasyPlayerValue.value).where(
        FantasyPlayerValue.league_id == league_id, FantasyPlayerValue.player_id == player_id
    )
    value = (await db.execute(query)).scalar_one_or_none()
    return value if value is not None else INITIAL_PLAYER_VALUE


def value_of(values: Mapping[str, int], player_id: uuid.UUID | str) -> int:
    """Valor actual; un jugador sin fila (no debería pasar) vale lo inicial."""
    return values.get(str(player_id), INITIAL_PLAYER_VALUE)


async def last_value_changes(db: AsyncSession, league_id: uuid.UUID) -> dict[str, int]:
    """Cambio de valor de cada jugador en la última jornada cerrada (por fecha del partido)."""
    last = (
        select(FantasySettledRound.match_id)
        .join(Match, Match.id == FantasySettledRound.match_id)
        .join(TeamSession, TeamSession.id == Match.session_id)
        .where(FantasySettledRound.league_id == league_id)
        .order_by(TeamSession.held_on.desc(), FantasySettledRound.settled_at.desc())
        .limit(1)
        .scalar_subquery()
    )
    query = select(
        FantasyValueChange.player_id, FantasyValueChange.after - FantasyValueChange.before
    ).where(FantasyValueChange.league_id == league_id, FantasyValueChange.match_id == last)
    return {str(pid): change for pid, change in (await db.execute(query)).all()}


# --- Traspasos -----------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class TransferRow:
    transfer: FantasyTransfer
    player: Player


async def record_transfer(
    db: AsyncSession,
    copy: FantasyCopy,
    to_participant_id: uuid.UUID | None,
    *,
    price: int,
    kind: TransferKind,
    at: datetime,
) -> None:
    """Cambia el dueño de la copia y lo apunta en el historial. El nuevo dueño estrena cláusula
    (1,5 × el valor actual, o 1,25 × lo pagado si es más); en la banca no hay cláusula."""
    # La cláusula se calcula antes de tocar la copia: la consulta haría flush a medias.
    clause = (
        clause_after_purchase(await player_value(db, copy.league_id, copy.player_id), price)
        if to_participant_id is not None
        else None
    )
    db.add(
        FantasyTransfer(
            league_id=copy.league_id,
            copy_id=copy.id,
            from_participant_id=copy.owner_id,
            to_participant_id=to_participant_id,
            price=price,
            kind=kind,
            at=at,
        )
    )
    copy.owner_id = to_participant_id
    copy.acquired_at = at if to_participant_id is not None else None
    copy.clause = clause
    await db.flush()


async def transfers_of(db: AsyncSession, copy_ids: Iterable[str]) -> list[Transfer]:
    """Historial de propiedad de las copias, en orden de registro."""
    ids = [uuid.UUID(c) for c in set(copy_ids)]
    if not ids:
        return []
    query = (
        select(FantasyTransfer.copy_id, FantasyTransfer.to_participant_id, FantasyTransfer.at)
        .where(FantasyTransfer.copy_id.in_(ids))
        .order_by(FantasyTransfer.id)
    )
    return [
        Transfer(str(c), str(to) if to else None, at)
        for c, to, at in (await db.execute(query)).all()
    ]


async def recent_transfers(
    db: AsyncSession, league_id: uuid.UUID, kinds: Sequence[TransferKind], limit: int
) -> list[TransferRow]:
    query = (
        select(FantasyTransfer, Player)
        .join(FantasyCopy, FantasyCopy.id == FantasyTransfer.copy_id)
        .join(Player, Player.id == FantasyCopy.player_id)
        .where(FantasyTransfer.league_id == league_id, FantasyTransfer.kind.in_(kinds))
        .order_by(FantasyTransfer.at.desc(), FantasyTransfer.id.desc())
        .limit(limit)
    )
    return [TransferRow(t, p) for t, p in (await db.execute(query)).all()]


# --- Saldo ---------------------------------------------------------------------------------------


async def apply_movement(
    db: AsyncSession, participant_id: uuid.UUID, amount: int, kind: LedgerKind, at: datetime
) -> int:
    """Suma `amount` (con signo) al saldo, lo apunta y devuelve el saldo nuevo."""
    db.add(FantasyLedgerEntry(participant_id=participant_id, amount=amount, kind=kind, at=at))
    balance = await db.scalar(
        update(FantasyParticipant)
        .where(FantasyParticipant.id == participant_id)
        .values(balance=FantasyParticipant.balance + amount)
        .returning(FantasyParticipant.balance)
        .execution_options(synchronize_session="fetch")
    )
    await db.flush()
    assert balance is not None
    return int(balance)


async def ledger_of(
    db: AsyncSession, participant_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, list[LedgerEntry]]:
    ids = list(set(participant_ids))
    if not ids:
        return {}
    query = select(
        FantasyLedgerEntry.participant_id, FantasyLedgerEntry.amount, FantasyLedgerEntry.at
    ).where(FantasyLedgerEntry.participant_id.in_(ids))
    ledger: dict[uuid.UUID, list[LedgerEntry]] = {}
    for pid, amount, at in (await db.execute(query)).all():
        ledger.setdefault(pid, []).append(LedgerEntry(amount, at))
    return ledger


# --- Jornadas cerradas ---------------------------------------------------------------------------


async def pending_round_ids(
    db: AsyncSession, league_id: uuid.UUID, starts_on: date, today: date
) -> list[str]:
    """Jornadas que ya tocaría cerrar: partidos oficiales de la liga anteriores a hoy (Madrid),
    cerrados (con tramos) y sin cerrar en el Fantasy."""
    settled = exists().where(
        FantasySettledRound.league_id == league_id, FantasySettledRound.match_id == Match.id
    )
    closed = exists().where(StintRow.match_id == Match.id)
    query = (
        select(Match.id)
        .join(TeamSession, TeamSession.id == Match.session_id)
        .where(
            Match.is_official.is_(True),
            TeamSession.held_on >= starts_on,
            TeamSession.held_on < today,
            closed,
            ~settled,
        )
    )
    return [str(mid) for mid in (await db.execute(query)).scalars().all()]


async def settled_round_ids(db: AsyncSession, league_id: uuid.UUID) -> set[str]:
    query = select(FantasySettledRound.match_id).where(FantasySettledRound.league_id == league_id)
    return {str(mid) for mid in (await db.execute(query)).scalars().all()}


async def round_scores(
    db: AsyncSession, league_id: uuid.UUID, match_ids: Iterable[str]
) -> dict[tuple[str, uuid.UUID], FantasyRoundScore]:
    """Puntos congelados por (jornada, participante)."""
    ids = [uuid.UUID(m) for m in set(match_ids)]
    if not ids:
        return {}
    query = select(FantasyRoundScore).where(
        FantasyRoundScore.league_id == league_id, FantasyRoundScore.match_id.in_(ids)
    )
    return {
        (str(row.match_id), row.participant_id): row
        for row in (await db.execute(query)).scalars().all()
    }


@dataclass(frozen=True, slots=True)
class FrozenScore:
    participant_id: uuid.UUID
    points: int
    payout: int
    negative_balance: bool
    slots: list[dict[str, Any]]


async def save_settlement(
    db: AsyncSession,
    league_id: uuid.UUID,
    match_id: uuid.UUID,
    settled_at: datetime,
    scores: Iterable[FrozenScore],
    values: Mapping[str, tuple[int, int]],
) -> None:
    """Congela la jornada: puntos por participante y valores (antes, después) por jugador."""
    db.add(FantasySettledRound(league_id=league_id, match_id=match_id, settled_at=settled_at))
    await db.flush()
    db.add_all(
        FantasyRoundScore(
            league_id=league_id,
            match_id=match_id,
            participant_id=s.participant_id,
            points=s.points,
            payout=s.payout,
            negative_balance=s.negative_balance,
            slots=s.slots,
        )
        for s in scores
    )
    for player_id, (before, after) in values.items():
        db.add(
            FantasyValueChange(
                league_id=league_id,
                match_id=match_id,
                player_id=uuid.UUID(player_id),
                before=before,
                after=after,
            )
        )
        await db.execute(
            update(FantasyPlayerValue)
            .where(
                FantasyPlayerValue.league_id == league_id,
                FantasyPlayerValue.player_id == uuid.UUID(player_id),
            )
            .values(value=after)
        )
    await db.flush()
