"""Garantías de la BD del Fantasy: una liga activa, copias únicas y alineaciones con historial."""

import uuid
from datetime import UTC, date, datetime

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import fantasy_money_repo, fantasy_repo
from app.db.models import FantasyCopy, FantasyPlayerValue, Player, User
from app.domain.fantasy.lineup import Lineup
from app.domain.fantasy.market import TransferKind
from app.domain.points.callup import Position
from app.domain.roles import Role

NOW = datetime(2026, 10, 10, 10, 0, tzinfo=UTC)
LATER = datetime(2026, 10, 12, 10, 0, tzinfo=UTC)


async def _user(session: AsyncSession) -> User:
    user = User(email="coach@club.es", password_hash="x", role=Role.HEAD_COACH)
    session.add(user)
    await session.flush()
    return user


async def _player(session: AsyncSession, dorsal: int) -> Player:
    player = Player(name=f"J{dorsal}", dorsal=dorsal, position=Position.FIELD)
    session.add(player)
    await session.flush()
    return player


async def test_a_second_active_league_is_rejected_by_the_database(session: AsyncSession) -> None:
    user = await _user(session)
    await fantasy_repo.create_league(session, date(2026, 10, 10), user.id, NOW)

    with pytest.raises(fantasy_repo.LeagueExistsError):
        await fantasy_repo.create_league(session, date(2026, 10, 10), user.id, NOW)


async def test_an_owner_cannot_hold_two_copies_of_the_same_player(session: AsyncSession) -> None:
    user = await _user(session)
    player = await _player(session, 7)
    league = await fantasy_repo.create_league(session, date(2026, 10, 10), user.id, NOW)
    [participant] = await fantasy_repo.add_participants(session, league.id, [user.id], 0, NOW)
    await fantasy_repo.add_copies(session, league.id, [(str(player.id), 1), (str(player.id), 2)])
    copies = [c.copy_id for c in await fantasy_repo.free_field_copies(session, league.id)]

    with pytest.raises(IntegrityError):
        async with session.begin_nested():
            await fantasy_repo.assign_copies(session, participant.id, copies, NOW)


async def test_bank_copies_of_the_same_player_coexist(session: AsyncSession) -> None:
    user = await _user(session)
    player = await _player(session, 7)
    league = await fantasy_repo.create_league(session, date(2026, 10, 10), user.id, NOW)

    await fantasy_repo.add_copies(session, league.id, [(str(player.id), n) for n in (1, 2, 3)])

    assert len(await fantasy_repo.free_field_copies(session, league.id)) == 3


async def test_an_owned_copy_needs_an_acquisition_date(session: AsyncSession) -> None:
    user = await _user(session)
    player = await _player(session, 7)
    league = await fantasy_repo.create_league(session, date(2026, 10, 10), user.id, NOW)
    [participant] = await fantasy_repo.add_participants(session, league.id, [user.id], 0, NOW)

    with pytest.raises(IntegrityError):
        async with session.begin_nested():
            session.add(
                FantasyCopy(
                    league_id=league.id,
                    player_id=player.id,
                    copy_number=1,
                    owner_id=participant.id,
                    clause=6000,
                )
            )
            await session.flush()


async def test_an_owned_copy_needs_a_clause(session: AsyncSession) -> None:
    user = await _user(session)
    player = await _player(session, 7)
    league = await fantasy_repo.create_league(session, date(2026, 10, 10), user.id, NOW)
    [participant] = await fantasy_repo.add_participants(session, league.id, [user.id], 0, NOW)

    with pytest.raises(IntegrityError):
        async with session.begin_nested():
            session.add(
                FantasyCopy(
                    league_id=league.id,
                    player_id=player.id,
                    copy_number=1,
                    owner_id=participant.id,
                    acquired_at=NOW,
                )
            )
            await session.flush()


async def _league_with_copy(session: AsyncSession, value: int) -> tuple[uuid.UUID, FantasyCopy]:
    user = await _user(session)
    player = await _player(session, 7)
    league = await fantasy_repo.create_league(session, date(2026, 10, 10), user.id, NOW)
    [participant] = await fantasy_repo.add_participants(session, league.id, [user.id], 0, NOW)
    await fantasy_repo.add_copies(session, league.id, [(str(player.id), 1)])
    session.add(FantasyPlayerValue(league_id=league.id, player_id=player.id, value=value))
    await session.flush()
    [free] = await fantasy_repo.free_field_copies(session, league.id)
    copy = await session.get(FantasyCopy, uuid.UUID(free.copy_id))
    assert copy is not None
    return participant.id, copy


async def test_the_initial_deal_sets_the_clause_from_the_current_value(
    session: AsyncSession,
) -> None:
    participant_id, copy = await _league_with_copy(session, 4200)

    await fantasy_repo.assign_copies(session, participant_id, [str(copy.id)], NOW)

    await session.refresh(copy)
    assert copy.clause == 6300


async def test_a_transfer_to_a_participant_resets_the_clause_and_to_the_bank_clears_it(
    session: AsyncSession,
) -> None:
    participant_id, copy = await _league_with_copy(session, 5000)

    await fantasy_money_repo.record_transfer(
        session, copy, participant_id, price=5000, kind=TransferKind.MARKET, at=NOW
    )
    assert copy.clause == 7500

    await fantasy_money_repo.record_transfer(
        session, copy, None, price=3500, kind=TransferKind.BANK_SALE, at=LATER
    )
    assert copy.clause is None


async def test_lineup_history_keeps_every_saved_version_in_order(session: AsyncSession) -> None:
    user = await _user(session)
    player = await _player(session, 7)
    league = await fantasy_repo.create_league(session, date(2026, 10, 10), user.id, NOW)
    [participant] = await fantasy_repo.add_participants(session, league.id, [user.id], 0, NOW)
    await fantasy_repo.add_copies(session, league.id, [(str(player.id), 1)])
    [copy] = await fantasy_repo.free_field_copies(session, league.id)
    first = Lineup(goalkeeper=None, field=(copy.copy_id, None, None, None))
    second = Lineup(goalkeeper=None, field=(None, None, None, copy.copy_id))

    await fantasy_repo.save_lineup(session, participant.id, second, LATER)
    await fantasy_repo.save_lineup(session, participant.id, first, NOW)

    history = (await fantasy_repo.lineup_history(session, [participant.id]))[participant.id]
    assert [(s.saved_at, s.lineup) for s in history] == [(NOW, first), (LATER, second)]
