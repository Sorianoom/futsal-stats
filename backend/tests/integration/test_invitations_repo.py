import asyncio
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.db.invitations_repo import (
    claim_invitation,
    create_invitation,
    player_has_user,
    players_with_active_account,
)
from app.db.models import Player, PlayerInvitation, User
from app.db.users_repo import create_user
from app.domain.points.callup import Position
from app.domain.roles import Role

PASSWORD = "S3cret-pass-word!"
NOW = datetime(2026, 11, 7, 12, 0, tzinfo=UTC)
HASH = "a" * 64


async def make_player(db: AsyncSession, dorsal: int = 7) -> Player:
    player = Player(name=f"Jugador {dorsal}", dorsal=dorsal, position=Position.FIELD)
    db.add(player)
    await db.flush()
    return player


async def make_coach(db: AsyncSession, email: str = "coach@club.es") -> User:
    return await create_user(db, email, PASSWORD, Role.HEAD_COACH)


async def test_a_player_user_must_be_linked_to_a_player(session: AsyncSession) -> None:
    with pytest.raises(IntegrityError):
        await create_user(session, "j@club.es", PASSWORD, Role.PLAYER)


async def test_a_staff_user_cannot_be_linked_to_a_player(session: AsyncSession) -> None:
    player = await make_player(session)

    with pytest.raises(IntegrityError):
        await create_user(session, "c@club.es", PASSWORD, Role.HEAD_COACH, player_id=player.id)


async def test_a_player_has_at_most_one_user(session: AsyncSession) -> None:
    player = await make_player(session)
    await create_user(session, "uno@club.es", PASSWORD, Role.PLAYER, player_id=player.id)

    with pytest.raises(IntegrityError):
        await create_user(session, "dos@club.es", PASSWORD, Role.PLAYER, player_id=player.id)


async def test_an_invitation_is_claimed_only_once(session: AsyncSession) -> None:
    player, coach = await make_player(session), await make_coach(session)
    await create_invitation(session, player.id, coach.id, HASH, NOW)

    first = await claim_invitation(session, HASH, NOW)
    second = await claim_invitation(session, HASH, NOW)

    assert first is not None and first.used_at == NOW
    assert second is None


async def test_an_expired_invitation_cannot_be_claimed(session: AsyncSession) -> None:
    player, coach = await make_player(session), await make_coach(session)
    invitation = await create_invitation(session, player.id, coach.id, HASH, NOW)

    claimed = await claim_invitation(session, HASH, invitation.expires_at + timedelta(seconds=1))

    assert claimed is None


async def test_a_new_invitation_removes_the_unused_ones_of_that_player(
    session: AsyncSession,
) -> None:
    player, other, coach = (
        await make_player(session, 7),
        await make_player(session, 8),
        await make_coach(session),
    )
    await create_invitation(session, player.id, coach.id, "1" * 64, NOW)
    await create_invitation(session, other.id, coach.id, "2" * 64, NOW)

    await create_invitation(session, player.id, coach.id, "3" * 64, NOW)

    hashes = set((await session.execute(select(PlayerInvitation.token_hash))).scalars())
    assert hashes == {"2" * 64, "3" * 64}


async def test_accounts_are_reported_in_one_query_and_only_when_active(
    session: AsyncSession,
) -> None:
    active, inactive, without = (
        await make_player(session, 7),
        await make_player(session, 8),
        await make_player(session, 9),
    )
    await create_user(session, "a@club.es", PASSWORD, Role.PLAYER, player_id=active.id)
    user = await create_user(session, "b@club.es", PASSWORD, Role.PLAYER, player_id=inactive.id)
    user.is_active = False
    await session.flush()

    accounts = await players_with_active_account(session, [active.id, inactive.id, without.id])

    assert accounts == {active.id}
    assert await player_has_user(session, inactive.id) is True
    assert await player_has_user(session, without.id) is False


@pytest.fixture
async def committed_invitation(engine: AsyncEngine) -> AsyncIterator[str]:
    """Invitación confirmada de verdad: la concurrencia necesita dos transacciones reales."""
    token_hash = uuid.uuid4().hex * 2
    async with AsyncSession(engine, expire_on_commit=False) as db:
        player = await make_player(db, 77)
        coach = await make_coach(db, f"{token_hash[:8]}@club.es")
        await create_invitation(db, player.id, coach.id, token_hash, NOW)
        await db.commit()
    yield token_hash
    async with AsyncSession(engine) as db:
        await db.execute(delete(PlayerInvitation).where(PlayerInvitation.player_id == player.id))
        await db.execute(delete(User).where(User.id == coach.id))
        await db.execute(delete(Player).where(Player.id == player.id))
        await db.commit()


async def test_concurrent_claims_succeed_only_once(
    engine: AsyncEngine, committed_invitation: str
) -> None:
    async def claim() -> bool:
        async with AsyncSession(engine) as db:
            claimed = await claim_invitation(db, committed_invitation, NOW)
            # Retiene el bloqueo un momento para que la otra transacción tenga que esperar.
            await asyncio.sleep(0.2)
            await db.commit()
            return claimed is not None

    results = await asyncio.gather(claim(), claim())

    assert sorted(results) == [False, True]
