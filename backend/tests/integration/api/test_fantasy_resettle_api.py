"""Fantasy: volver a cerrar una jornada ya cerrada (corrige puntos, cobros y valores)."""

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.fantasy.rules import INITIAL_PLAYER_VALUE
from app.domain.fantasy.values import next_value
from app.services.fantasy_resettle import ResettleError, resettle_round
from tests.integration.api.conftest import Join, MakePlayer
from tests.integration.api.fantasy_support import LEAGUE_DAY, Clock, fantasy_client, me
from tests.integration.api.test_fantasy_settlement_api import (
    _detail,
    _points,
    _points_or_none,
    _round_with_lineup,
    _stats,
)
from tests.integration.api.test_sync_api import event, sync

SETTLED = datetime(2026, 10, 18, 10, 0, tzinfo=UTC)


@pytest.fixture
def clock() -> Clock:
    return Clock(LEAGUE_DAY)


@pytest.fixture
async def client(session: AsyncSession, clock: Clock) -> AsyncIterator[AsyncClient]:
    async for http in fantasy_client(session, clock):
        yield http


async def test_resettling_applies_corrected_stats_to_points_balance_and_values(
    client: AsyncClient,
    session: AsyncSession,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
    make_player: MakePlayer,
) -> None:
    headers, match_id, team = await _round_with_lineup(client, clock, join, staff, make_player)
    clock.now = SETTLED
    frozen = await _detail(client, headers, match_id)
    balance_before = (await me(client, headers))["me"]["balance"]
    scorer = team["squad"][0]
    # Corrección después del cierre: un gol que no se apuntó. El cierre no se entera.
    await sync(client, staff, match_id, events=[event(50, "goal", scorer["player_id"], 2, 900)])
    assert (await _detail(client, headers, match_id)) == frozen

    changes = await resettle_round(session, uuid.UUID(match_id), clock.now)

    rows = await _stats(client, headers, match_id)
    detail = await _detail(client, headers, match_id)
    expected = sum(_points(rows, c["player_id"]) for c in team["squad"])
    assert detail["status"] == "settled"
    assert detail["total"] == expected > frozen["total"]
    payout_delta = detail["payout"] - frozen["payout"]
    view = await me(client, headers)
    assert view["me"]["balance"] == balance_before + payout_delta
    for entry in view["squad"]:
        points = _points_or_none(rows, entry["player_id"])
        assert entry["value"] == next_value(INITIAL_PLAYER_VALUE, points)
    [change] = changes
    assert (change.points_before, change.points_after) == (frozen["total"], detail["total"])


async def test_resettling_twice_changes_nothing(
    client: AsyncClient,
    session: AsyncSession,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
    make_player: MakePlayer,
) -> None:
    headers, match_id, _ = await _round_with_lineup(client, clock, join, staff, make_player)
    clock.now = SETTLED
    before = await me(client, headers)
    detail = await _detail(client, headers, match_id)

    await resettle_round(session, uuid.UUID(match_id), clock.now)
    await resettle_round(session, uuid.UUID(match_id), clock.now)

    assert await _detail(client, headers, match_id) == detail
    after = await me(client, headers)
    assert after["me"]["balance"] == before["me"]["balance"]
    assert [c["value"] for c in after["squad"]] == [c["value"] for c in before["squad"]]


async def test_an_unsettled_round_cannot_be_resettled(
    client: AsyncClient,
    session: AsyncSession,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
    make_player: MakePlayer,
) -> None:
    _, match_id, _ = await _round_with_lineup(client, clock, join, staff, make_player)

    with pytest.raises(ResettleError, match="no está cerrada"):
        await resettle_round(session, uuid.UUID(match_id), clock.now)
