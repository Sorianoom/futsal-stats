"""Acceso a datos de sesiones, asistencia, movimientos, partidos y exclusiones.

Las funciones hacen flush; el commit lo decide el endpoint.
"""

import uuid
from collections.abc import Iterable, Sequence
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Attendance,
    Exclusion,
    Match,
    MovementRow,
    Player,
    TeamSession,
)
from app.domain.points.attendance import AttendanceStatus, SessionKind
from app.domain.points.catalog import SanctionKind
from app.domain.points.ledger import Movement
from app.domain.points.weeks import DAYS_PER_WEEK

EXCLUSION_CONSTRAINT = "uq_exclusions_player_id"


class DuplicateExclusionError(Exception):
    """El jugador ya tiene esa exclusión para el partido."""


def movement_to_domain(row: MovementRow) -> Movement:
    return Movement(
        player_id=str(row.player_id),
        occurred_on=row.occurred_on,
        points=row.points,
        reason=row.reason,
        applies_week=row.applies_week,
        session_id=str(row.session_id) if row.session_id else None,
        infraction_code=row.infraction_code,
    )


def movement_to_row(movement: Movement, created_by: uuid.UUID | None) -> MovementRow:
    return MovementRow(
        player_id=uuid.UUID(movement.player_id),
        occurred_on=movement.occurred_on,
        points=movement.points,
        reason=movement.reason,
        applies_week=movement.applies_week,
        session_id=uuid.UUID(movement.session_id) if movement.session_id else None,
        infraction_code=movement.infraction_code,
        created_by=created_by,
    )


async def create_session(
    db: AsyncSession, kind: SessionKind, held_on: date, notes: str | None
) -> TeamSession:
    team_session = TeamSession(kind=kind, held_on=held_on, notes=notes)
    db.add(team_session)
    await db.flush()
    return team_session


async def get_session_row(db: AsyncSession, session_id: uuid.UUID) -> TeamSession | None:
    return await db.get(TeamSession, session_id)


async def list_sessions(db: AsyncSession, week: date) -> list[TeamSession]:
    end = week + timedelta(days=DAYS_PER_WEEK)
    query = (
        select(TeamSession)
        .where(TeamSession.held_on >= week, TeamSession.held_on < end)
        .order_by(TeamSession.held_on, TeamSession.created_at)
    )
    return list((await db.execute(query)).scalars().all())


async def find_missing_players(db: AsyncSession, player_ids: Iterable[uuid.UUID]) -> set[uuid.UUID]:
    wanted = set(player_ids)
    if not wanted:
        return set()
    found = (await db.execute(select(Player.id).where(Player.id.in_(wanted)))).scalars().all()
    return wanted - set(found)


async def list_attendance(db: AsyncSession, session_id: uuid.UUID) -> list[Attendance]:
    query = select(Attendance).where(Attendance.session_id == session_id)
    return list((await db.execute(query)).scalars().all())


async def save_attendance(
    db: AsyncSession,
    session_id: uuid.UUID,
    records: Sequence[tuple[uuid.UUID, AttendanceStatus, bool, int]],
) -> None:
    existing = {a.player_id: a for a in await list_attendance(db, session_id)}
    for player_id, status, notified, minutes_late in records:
        row = existing.get(player_id)
        if row is None:
            db.add(
                Attendance(
                    session_id=session_id,
                    player_id=player_id,
                    status=status,
                    notified=notified,
                    minutes_late=minutes_late,
                )
            )
        else:
            row.status, row.notified, row.minutes_late = status, notified, minutes_late
    await db.flush()


async def add_movements(
    db: AsyncSession, movements: Iterable[Movement], created_by: uuid.UUID | None
) -> list[MovementRow]:
    rows = [movement_to_row(m, created_by) for m in movements]
    db.add_all(rows)
    await db.flush()
    return rows


async def list_movement_rows(
    db: AsyncSession, week: date, player_id: uuid.UUID | None = None
) -> list[MovementRow]:
    query = select(MovementRow).where(MovementRow.applies_week == week)
    if player_id is not None:
        query = query.where(MovementRow.player_id == player_id)
    query = query.order_by(MovementRow.occurred_on, MovementRow.created_at)
    return list((await db.execute(query)).scalars().all())


async def week_movements(db: AsyncSession, week: date) -> list[Movement]:
    return [movement_to_domain(row) for row in await list_movement_rows(db, week)]


async def get_movement(db: AsyncSession, movement_id: uuid.UUID) -> MovementRow | None:
    return await db.get(MovementRow, movement_id)


async def delete_row(db: AsyncSession, row: object) -> None:
    await db.delete(row)
    await db.flush()


async def create_match(db: AsyncSession, held_on: date, opponent: str) -> Match:
    team_session = await create_session(db, SessionKind.MATCH, held_on, None)
    match = Match(session_id=team_session.id, opponent=opponent)
    db.add(match)
    await db.flush()
    return match


async def get_match(db: AsyncSession, match_id: uuid.UUID) -> Match | None:
    return await db.get(Match, match_id)


async def list_matches(db: AsyncSession) -> list[tuple[Match, date]]:
    query = (
        select(Match, TeamSession.held_on)
        .join(TeamSession, TeamSession.id == Match.session_id)
        .order_by(TeamSession.held_on.desc())
    )
    return [(match, held_on) for match, held_on in (await db.execute(query)).all()]


async def match_date(db: AsyncSession, match: Match) -> date:
    team_session = await db.get(TeamSession, match.session_id)
    assert team_session is not None
    return team_session.held_on


async def create_exclusion(
    db: AsyncSession, player_id: uuid.UUID, match_id: uuid.UUID, kind: SanctionKind
) -> Exclusion:
    exclusion = Exclusion(player_id=player_id, match_id=match_id, kind=kind)
    db.add(exclusion)
    try:
        await db.flush()
    except IntegrityError as error:
        await db.rollback()
        if EXCLUSION_CONSTRAINT in str(error.orig):
            raise DuplicateExclusionError from error
        raise
    return exclusion


async def list_exclusions(db: AsyncSession, match_id: uuid.UUID) -> list[Exclusion]:
    query = select(Exclusion).where(Exclusion.match_id == match_id).order_by(Exclusion.created_at)
    return list((await db.execute(query)).scalars().all())


async def get_exclusion(db: AsyncSession, exclusion_id: uuid.UUID) -> Exclusion | None:
    return await db.get(Exclusion, exclusion_id)


async def exclusions_by_player(db: AsyncSession, match_id: uuid.UUID) -> dict[str, SanctionKind]:
    return {str(e.player_id): e.kind for e in await list_exclusions(db, match_id)}


async def active_players(db: AsyncSession) -> list[Player]:
    query = select(Player).where(Player.is_active.is_(True)).order_by(Player.dorsal)
    return list((await db.execute(query)).scalars().all())
