import uuid
from datetime import date

import pytest
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.db.models import (
    Match,
    MatchEvent,
    MovementRow,
    Player,
    QuintetRatingRow,
    StintRow,
    TeamSession,
    User,
)
from app.domain.points.attendance import SessionKind
from app.domain.points.callup import Position
from app.domain.roles import Role
from app.domain.stints.events import EventKind

MONDAY = date(2026, 10, 12)


async def make_player(db: AsyncSession, dorsal: int = 7) -> Player:
    player = Player(name=f"Jugador {dorsal}", dorsal=dorsal, position=Position.FIELD)
    db.add(player)
    await db.flush()
    return player


async def make_match(db: AsyncSession) -> Match:
    team_session = TeamSession(kind=SessionKind.MATCH, held_on=MONDAY)
    db.add(team_session)
    await db.flush()
    match = Match(session_id=team_session.id, opponent="Rival")
    db.add(match)
    await db.flush()
    return match


async def test_migration_creates_every_table(engine: AsyncEngine) -> None:
    async with engine.connect() as connection:
        tables = await connection.run_sync(lambda c: set(inspect(c).get_table_names()))

    assert {"players", "movements", "stints", "match_events", "infractions"} <= tables


async def test_player_defaults_to_available(session: AsyncSession) -> None:
    player = await make_player(session)
    await session.refresh(player)

    assert player.status.value == "available"
    assert player.is_active


async def test_dorsal_must_be_unique(session: AsyncSession) -> None:
    await make_player(session, dorsal=9)

    with pytest.raises(IntegrityError):
        await make_player(session, dorsal=9)


async def test_user_email_must_be_unique(session: AsyncSession) -> None:
    session.add(User(email="a@club.es", password_hash="x", role=Role.HEAD_COACH))
    await session.flush()
    session.add(User(email="a@club.es", password_hash="y", role=Role.ASSISTANT_COACH))

    with pytest.raises(IntegrityError):
        await session.flush()


async def test_movement_must_apply_to_a_monday(session: AsyncSession) -> None:
    player = await make_player(session)
    session.add(
        MovementRow(
            player_id=player.id,
            occurred_on=MONDAY,
            points=2,
            reason="x",
            applies_week=date(2026, 10, 14),
        )
    )

    with pytest.raises(IntegrityError, match="applies_week_is_monday"):
        await session.flush()


async def test_movement_on_a_monday_is_accepted(session: AsyncSession) -> None:
    player = await make_player(session)
    session.add(
        MovementRow(
            player_id=player.id, occurred_on=MONDAY, points=2, reason="x", applies_week=MONDAY
        )
    )

    await session.flush()


async def test_overlapping_stints_are_rejected_by_the_database(session: AsyncSession) -> None:
    player, match = await make_player(session), await make_match(session)
    session.add(StintRow(match_id=match.id, player_id=player.id, part=1, start_s=0, end_s=400))
    await session.flush()
    session.add(StintRow(match_id=match.id, player_id=player.id, part=1, start_s=300, end_s=600))

    with pytest.raises(IntegrityError, match="stints_no_overlap"):
        await session.flush()


async def test_touching_stints_are_allowed(session: AsyncSession) -> None:
    player, match = await make_player(session), await make_match(session)
    session.add(StintRow(match_id=match.id, player_id=player.id, part=1, start_s=0, end_s=300))
    session.add(StintRow(match_id=match.id, player_id=player.id, part=1, start_s=300, end_s=600))

    await session.flush()


async def test_same_seconds_in_another_part_do_not_overlap(session: AsyncSession) -> None:
    player, match = await make_player(session), await make_match(session)
    session.add(StintRow(match_id=match.id, player_id=player.id, part=1, start_s=0, end_s=600))
    session.add(StintRow(match_id=match.id, player_id=player.id, part=2, start_s=0, end_s=600))

    await session.flush()


async def test_stint_must_end_after_it_starts(session: AsyncSession) -> None:
    player, match = await make_player(session), await make_match(session)
    session.add(StintRow(match_id=match.id, player_id=player.id, part=1, start_s=300, end_s=300))

    with pytest.raises(IntegrityError, match="end_after_start"):
        await session.flush()


async def test_event_part_must_be_one_or_two(session: AsyncSession) -> None:
    match = await make_match(session)
    session.add(
        MatchEvent(id=uuid.uuid4(), match_id=match.id, seq=1, kind=EventKind.GOAL, part=3, t=0)
    )

    with pytest.raises(IntegrityError, match="part_valid"):
        await session.flush()


async def test_event_sequence_is_unique_per_match(session: AsyncSession) -> None:
    match = await make_match(session)
    session.add(
        MatchEvent(id=uuid.uuid4(), match_id=match.id, seq=1, kind=EventKind.GOAL, part=1, t=0)
    )
    await session.flush()
    session.add(
        MatchEvent(id=uuid.uuid4(), match_id=match.id, seq=1, kind=EventKind.SHOT, part=1, t=5)
    )

    with pytest.raises(IntegrityError):
        await session.flush()


async def test_event_id_is_unique_so_resending_is_detectable(session: AsyncSession) -> None:
    match = await make_match(session)
    event_id = uuid.uuid4()
    session.add(MatchEvent(id=event_id, match_id=match.id, seq=1, kind=EventKind.GOAL, part=1, t=0))
    await session.flush()
    session.add(MatchEvent(id=event_id, match_id=match.id, seq=2, kind=EventKind.GOAL, part=1, t=0))

    with pytest.raises(IntegrityError):
        await session.flush()


@pytest.mark.parametrize("stars", [0, 6])
async def test_rating_stars_must_be_between_one_and_five(session: AsyncSession, stars: int) -> None:
    match = await make_match(session)
    session.add(QuintetRatingRow(id=uuid.uuid4(), match_id=match.id, part=1, t=10, stars=stars))

    with pytest.raises(IntegrityError, match="stars_valid"):
        await session.flush()
