"""Procesado perezoso del Fantasy con transacciones reales: dos peticiones a la vez no resuelven
dos veces una venta ni abren dos mercados el mismo día. Y una sola venta abierta por copia."""

import asyncio
import random
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.db.models import (
    FantasyLeague,
    FantasyListing,
    FantasyParticipant,
    FantasyTransfer,
    Player,
    User,
)
from app.db.users_repo import create_user
from app.domain.fantasy.market import TransferKind
from app.domain.fantasy.rules import INITIAL_BALANCE, MARKET_FIRST_WEEK_SIZE
from app.domain.points.callup import Position
from app.domain.roles import Role
from app.services import fantasy, fantasy_market, fantasy_team

LEAGUE_DAY = datetime(2026, 10, 10, 10, 0, tzinfo=UTC)
NEXT_DAY = datetime(2026, 10, 11, 10, 0, tzinfo=UTC)
BID = 5000


@dataclass(frozen=True)
class CommittedLeague:
    user_id: uuid.UUID
    league_id: uuid.UUID
    listing_id: uuid.UUID


async def _user(db: AsyncSession) -> User:
    return await create_user(db, f"{uuid.uuid4().hex[:10]}@club.es", "x" * 12, Role.FANTASY)


async def _setup(db: AsyncSession, user: User) -> CommittedLeague:
    """Liga con una puja del usuario en el mercado del primer día (todo confirmado)."""
    await fantasy.create_league(db, user, LEAGUE_DAY, random.Random(1))
    team = await fantasy_team.my_team(db, user, LEAGUE_DAY, random.Random(1))
    assert team is not None
    listings = await fantasy_market.market(db, user, LEAGUE_DAY, random.Random(1))
    owned = {c.player_id for c in team.squad}
    target = next(x for x in listings.listings if x.player_id not in owned)
    await fantasy_market.place_bid(db, user, LEAGUE_DAY, random.Random(1), target.listing_id, BID)
    return CommittedLeague(user.id, team.league.id, target.listing_id)


async def _cleanup(engine: AsyncEngine, user_id: uuid.UUID, player_ids: list[uuid.UUID]) -> None:
    async with AsyncSession(engine) as db:
        await db.execute(delete(FantasyLeague).where(FantasyLeague.created_by == user_id))
        await db.execute(delete(User).where(User.id == user_id))
        await db.execute(delete(Player).where(Player.id.in_(player_ids)))
        await db.commit()


@pytest.fixture
async def committed_league(engine: AsyncEngine) -> AsyncIterator[CommittedLeague]:
    """Liga confirmada de verdad: la concurrencia necesita transacciones reales. Se borra al
    terminar aunque falle la preparación."""
    async with AsyncSession(engine, expire_on_commit=False) as db:
        players = [Player(name=f"C{n}", dorsal=80 + n, position=Position.FIELD) for n in range(8)]
        db.add_all(players)
        user = await _user(db)
        await db.commit()
        try:
            league = await _setup(db, user)
        except BaseException:
            await db.rollback()
            await _cleanup(engine, user.id, [p.id for p in players])
            raise
    try:
        yield league
    finally:
        await _cleanup(engine, user.id, [p.id for p in players])


async def test_two_requests_at_once_process_the_pending_work_once(
    engine: AsyncEngine, committed_league: CommittedLeague
) -> None:
    async def visit() -> None:
        async with AsyncSession(engine, expire_on_commit=False) as db:
            user = await db.get(User, committed_league.user_id)
            assert user is not None
            await fantasy.enter(db, user, NEXT_DAY, random.Random(2))

    await asyncio.gather(visit(), visit(), visit())

    async with AsyncSession(engine) as db:
        moves = await db.scalar(
            select(func.count())
            .select_from(FantasyTransfer)
            .where(
                FantasyTransfer.league_id == committed_league.league_id,
                FantasyTransfer.kind == TransferKind.MARKET,
            )
        )
        today = await db.scalar(
            select(func.count())
            .select_from(FantasyListing)
            .where(
                FantasyListing.league_id == committed_league.league_id,
                FantasyListing.market_day == NEXT_DAY.date(),
            )
        )
        balance = await db.scalar(
            select(FantasyParticipant.balance).where(
                FantasyParticipant.league_id == committed_league.league_id
            )
        )
    assert moves == 1
    assert today == MARKET_FIRST_WEEK_SIZE
    assert balance == INITIAL_BALANCE - BID


async def test_a_copy_has_a_single_open_listing(session: AsyncSession) -> None:
    user = await _user(session)
    player = Player(name="Único", dorsal=70, position=Position.FIELD)
    session.add(player)
    await session.flush()
    await fantasy.create_league(session, user, LEAGUE_DAY, random.Random(1))
    await fantasy.enter(session, user, LEAGUE_DAY, random.Random(1))  # abre el mercado del día
    listing = await session.scalar(select(FantasyListing).limit(1))
    assert listing is not None
    duplicate = FantasyListing(
        league_id=listing.league_id,
        copy_id=listing.copy_id,
        opened_at=listing.opened_at,
        closes_at=listing.closes_at,
        market_day=listing.market_day,
    )

    with pytest.raises(IntegrityError):
        async with session.begin_nested():
            session.add(duplicate)
            await session.flush()
