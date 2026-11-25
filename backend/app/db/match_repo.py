"""Acceso a datos del partido en vivo: eventos, alineación, valoraciones y tramos.

Las funciones hacen flush; el commit lo decide el endpoint.
"""

import uuid
from collections.abc import Iterable, Sequence
from datetime import datetime
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import LineupEventRow, Match, MatchEvent, QuintetRatingRow, StintRow
from app.domain.stints.events import EventKind
from app.domain.stints.events import MatchEvent as DomainEvent
from app.domain.stints.models import Stint

type SyncModel = type[MatchEvent] | type[LineupEventRow] | type[QuintetRatingRow]
type SeqModel = type[MatchEvent] | type[LineupEventRow]


async def partition_ids(
    db: AsyncSession, model: SyncModel, match_id: uuid.UUID, ids: Iterable[uuid.UUID]
) -> tuple[set[str], set[str]]:
    """Ids ya guardados en este partido (own) y en otro partido (foreign)."""
    wanted = set(ids)
    if not wanted:
        return set(), set()
    rows = (await db.execute(select(model.id, model.match_id).where(model.id.in_(wanted)))).all()
    own = {str(row_id) for row_id, row_match in rows if row_match == match_id}
    foreign = {str(row_id) for row_id, row_match in rows if row_match != match_id}
    return own, foreign


async def taken_seqs(
    db: AsyncSession, model: SeqModel, match_id: uuid.UUID, seqs: Iterable[int]
) -> dict[int, str]:
    wanted = set(seqs)
    if not wanted:
        return {}
    query = select(model.seq, model.id).where(model.match_id == match_id, model.seq.in_(wanted))
    return {seq: str(row_id) for seq, row_id in (await db.execute(query)).all()}


async def event_kinds(
    db: AsyncSession, match_id: uuid.UUID, ids: Iterable[uuid.UUID]
) -> dict[str, EventKind]:
    wanted = set(ids)
    if not wanted:
        return {}
    query = select(MatchEvent.id, MatchEvent.kind).where(
        MatchEvent.match_id == match_id, MatchEvent.id.in_(wanted)
    )
    return {str(row_id): kind for row_id, kind in (await db.execute(query)).all()}


async def voided_event_ids(db: AsyncSession, match_id: uuid.UUID) -> set[str]:
    query = select(MatchEvent.voids_event_id).where(
        MatchEvent.match_id == match_id, MatchEvent.voids_event_id.is_not(None)
    )
    return {str(row_id) for row_id in (await db.execute(query)).scalars().all()}


async def add_rows(db: AsyncSession, rows: Sequence[Any]) -> None:
    db.add_all(rows)
    await db.flush()


async def list_events(db: AsyncSession, match_id: uuid.UUID) -> list[MatchEvent]:
    query = select(MatchEvent).where(MatchEvent.match_id == match_id).order_by(MatchEvent.seq)
    return list((await db.execute(query)).scalars().all())


async def list_lineup_events(db: AsyncSession, match_id: uuid.UUID) -> list[LineupEventRow]:
    query = (
        select(LineupEventRow)
        .where(LineupEventRow.match_id == match_id)
        .order_by(LineupEventRow.seq)
    )
    return list((await db.execute(query)).scalars().all())


async def stream_status(
    db: AsyncSession, model: SeqModel, match_id: uuid.UUID
) -> tuple[int, int | None]:
    query = select(func.count(), func.max(model.seq)).where(model.match_id == match_id)
    count, last_seq = (await db.execute(query)).one()
    return count, last_seq


async def count_ratings(db: AsyncSession, match_id: uuid.UUID) -> int:
    query = (
        select(func.count())
        .select_from(QuintetRatingRow)
        .where(QuintetRatingRow.match_id == match_id)
    )
    return (await db.execute(query)).scalar_one()


async def list_ratings(db: AsyncSession, match_id: uuid.UUID) -> list[QuintetRatingRow]:
    query = (
        select(QuintetRatingRow)
        .where(QuintetRatingRow.match_id == match_id)
        .order_by(QuintetRatingRow.part, QuintetRatingRow.t)
    )
    return list((await db.execute(query)).scalars().all())


async def list_stints(db: AsyncSession, match_id: uuid.UUID) -> list[StintRow]:
    query = (
        select(StintRow)
        .where(StintRow.match_id == match_id)
        .order_by(StintRow.part, StintRow.start_s, StintRow.player_id)
    )
    return list((await db.execute(query)).scalars().all())


async def replace_stints(
    db: AsyncSession, match_id: uuid.UUID, stints: Iterable[Stint]
) -> list[StintRow]:
    await db.execute(delete(StintRow).where(StintRow.match_id == match_id))
    rows = [
        StintRow(
            match_id=match_id,
            player_id=uuid.UUID(s.player_id),
            part=s.part,
            start_s=s.start,
            end_s=s.end,
        )
        for s in stints
    ]
    db.add_all(rows)
    await db.flush()
    return rows


async def get_stint(db: AsyncSession, stint_id: uuid.UUID) -> StintRow | None:
    return await db.get(StintRow, stint_id)


def stint_to_domain(row: StintRow) -> Stint:
    return Stint(str(row.player_id), row.part, row.start_s, row.end_s)


def event_to_domain(row: MatchEvent) -> DomainEvent:
    return DomainEvent(
        id=str(row.id),
        kind=row.kind,
        part=row.part,
        t=row.t,
        player_id=str(row.player_id) if row.player_id else None,
        voids=str(row.voids_event_id) if row.voids_event_id else None,
    )


async def stints_by_match(
    db: AsyncSession, match_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, list[Stint]]:
    """Tramos de varios partidos. Un partido sin tramos no está cerrado y no aparece."""
    wanted = list(set(match_ids))
    if not wanted:
        return {}
    grouped: dict[uuid.UUID, list[Stint]] = {}
    query = select(StintRow).where(StintRow.match_id.in_(wanted))
    for row in (await db.execute(query)).scalars().all():
        grouped.setdefault(row.match_id, []).append(stint_to_domain(row))
    return grouped


async def events_by_match(
    db: AsyncSession, match_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, list[DomainEvent]]:
    """Eventos de varios partidos, en el orden en que se registraron."""
    wanted = list(set(match_ids))
    if not wanted:
        return {}
    grouped: dict[uuid.UUID, list[DomainEvent]] = {}
    query = (
        select(MatchEvent)
        .where(MatchEvent.match_id.in_(wanted))
        .order_by(MatchEvent.match_id, MatchEvent.seq)
    )
    for row in (await db.execute(query)).scalars().all():
        grouped.setdefault(row.match_id, []).append(event_to_domain(row))
    return grouped


async def mark_started(db: AsyncSession, match_id: uuid.UUID, at: datetime) -> None:
    """Anota la hora de inicio del partido si aún no la tenía (la primera es la que vale)."""
    await db.execute(
        update(Match).where(Match.id == match_id, Match.started_at.is_(None)).values(started_at=at)
    )
