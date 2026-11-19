"""Fantasy, paso 3: cierre de jornada (puntos, cobros y valores congelados), propiedad de la copia
en el bloqueo y saldo negativo al bloquear.

El partido de `played_match` es el 17/10/2026: se bloquea a las 00:00 del 17 y se cierra a las
00:00 del 18 (hora de Madrid).
"""

import random
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import FantasyLedgerEntry, MatchEvent, StintRow
from app.domain.fantasy.rules import INITIAL_BALANCE, INITIAL_PLAYER_VALUE
from app.domain.fantasy.scoring import player_points
from app.domain.fantasy.values import next_value
from app.domain.roles import Role
from app.domain.stints.events import EventKind
from app.services.fantasy_processing import catch_up
from tests.integration.api.conftest import Login, MakePlayer
from tests.integration.api.fantasy_support import (
    LEAGUE_DAY,
    Clock,
    bid,
    buyable,
    create_league,
    fantasy_client,
    field_players,
    get_data,
    market,
    me,
)
from tests.integration.api.test_stats_api import played_match

Headers = dict[str, str]
BEFORE_LOCK = datetime(2026, 10, 16, 21, 59, tzinfo=UTC)  # 23:59 del 16 en Madrid
AFTER_LOCK = datetime(2026, 10, 16, 22, 0, tzinfo=UTC)  # 00:00 del 17 en Madrid
MATCH_EVENING = datetime(2026, 10, 17, 20, 0, tzinfo=UTC)  # jornada provisional
SETTLED = datetime(2026, 10, 18, 10, 0, tzinfo=UTC)  # jornada ya cerrada


@pytest.fixture
def clock() -> Clock:
    return Clock(LEAGUE_DAY)


@pytest.fixture
async def client(session: AsyncSession, clock: Clock) -> AsyncIterator[AsyncClient]:
    async for http in fantasy_client(session, clock):
        yield http


async def _stats(client: AsyncClient, headers: Headers, match_id: str) -> dict[str, Any]:
    stats = await get_data(client, f"/matches/{match_id}/stats", headers)
    return {row["player_id"]: row for row in stats["players"]}


def _points(rows: dict[str, Any], player_id: str) -> int:
    row = rows.get(player_id)
    return player_points(row["rating"], row["goals"]) if row else 0


async def _round_with_lineup(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    *,
    finalize: bool = True,
    captain: int | None = None,
) -> tuple[Headers, str, dict[str, Any]]:
    """Liga con los 2 de campo del entrenador alineados (el de índice `captain`, de capitán) y el
    partido del 17 jugado."""
    players = await field_players(make_player, 6)
    headers = await login()
    await create_league(client, headers)
    team = await me(client, headers)
    field = [c["copy_id"] for c in team["squad"]]
    body = {
        "field_copy_ids": field,
        "captain_copy_id": field[captain] if captain is not None else None,
    }
    await client.put("/fantasy/lineup", json=body, headers=headers)
    match_id, _ = await played_match(
        client, headers, make_player, players=players, finalize=finalize
    )
    return headers, match_id, team


async def _standings(client: AsyncClient, headers: Headers) -> dict[str, Any]:
    data: dict[str, Any] = await get_data(client, "/fantasy/standings", headers)
    return data


async def _detail(client: AsyncClient, headers: Headers, match_id: str) -> dict[str, Any]:
    data: dict[str, Any] = await get_data(client, f"/fantasy/rounds/{match_id}/me", headers)
    return data


async def _undo_twice(
    client: AsyncClient, session: AsyncSession, headers: Headers, match_id: str
) -> MatchEvent:
    """Deshace dos veces el mismo evento: la API no lo permite, pero un fallo de datos podría
    dejarlo así y el partido queda con eventos incoherentes."""
    stored = (await client.get(f"/matches/{match_id}/events", headers=headers)).json()["data"]
    already_undone = next(e["voids_event_id"] for e in stored if e["kind"] == "undo")
    broken = MatchEvent(
        id=uuid.uuid4(),
        match_id=uuid.UUID(match_id),
        seq=99,
        kind=EventKind.UNDO,
        part=1,
        t=10,
        player_id=None,
        voids_event_id=uuid.UUID(already_undone),
    )
    session.add(broken)
    await session.flush()
    return broken


async def test_a_round_is_provisional_until_midnight_and_then_settled(
    client: AsyncClient, login: Login, make_player: MakePlayer, clock: Clock
) -> None:
    headers, match_id, team = await _round_with_lineup(client, login, make_player)
    clock.now = MATCH_EVENING
    rows = await _stats(client, headers, match_id)
    expected = sum(_points(rows, c["player_id"]) for c in team["squad"])

    provisional = await _standings(client, headers)
    provisional_detail = await _detail(client, headers, match_id)
    clock.now = SETTLED
    settled = await _standings(client, headers)
    detail = await _detail(client, headers, match_id)
    after = await me(client, headers)

    assert expected > 0
    assert provisional["rounds"][0]["status"] == "scored"
    assert provisional["rows"][0]["points_by_round"] == {match_id: expected}
    assert provisional_detail["payout"] == 0
    assert provisional_detail["negative_balance"] is False
    assert settled["rounds"][0]["status"] == "settled"
    assert settled["rows"][0]["points_by_round"] == {match_id: expected}
    assert detail["status"] == "settled"
    assert detail["total"] == expected
    assert detail["payout"] == expected * 100
    assert after["me"]["balance"] == INITIAL_BALANCE + expected * 100


async def test_the_captain_scores_double_in_standings_payout_and_detail(
    client: AsyncClient, login: Login, make_player: MakePlayer, clock: Clock
) -> None:
    headers, match_id, team = await _round_with_lineup(client, login, make_player, captain=0)
    clock.now = MATCH_EVENING
    rows = await _stats(client, headers, match_id)
    captain = team["squad"][0]
    expected = sum(_points(rows, c["player_id"]) for c in team["squad"])
    expected += _points(rows, captain["player_id"])
    clock.now = SETTLED

    standings = await _standings(client, headers)
    detail = await _detail(client, headers, match_id)
    after = await me(client, headers)

    assert _points(rows, captain["player_id"]) > 0
    assert standings["rows"][0]["points_by_round"] == {match_id: expected}
    assert detail["total"] == expected
    by_copy = {s["copy_id"]: s for s in detail["slots"] if s["copy_id"]}
    assert by_copy[captain["copy_id"]]["captain"] is True
    assert by_copy[captain["copy_id"]]["points"] == 2 * _points(rows, captain["player_id"])
    assert after["me"]["balance"] == INITIAL_BALANCE + expected * 100


async def test_me_shows_each_copys_points_in_the_last_scored_round(
    client: AsyncClient, login: Login, make_player: MakePlayer, clock: Clock
) -> None:
    headers, match_id, team = await _round_with_lineup(client, login, make_player)
    before = await me(client, headers)
    clock.now = MATCH_EVENING
    rows = await _stats(client, headers, match_id)

    scored = await me(client, headers)
    clock.now = SETTLED
    settled = await me(client, headers)

    assert before["last_round"] is None
    assert {c["last_points"] for c in before["squad"]} == {None}
    for view in (scored, settled):
        assert view["last_round"]["match_id"] == match_id
        assert view["last_round"]["opponent"] == "Rival FS"
        points = {c["player_id"]: c["last_points"] for c in view["squad"]}
        assert points == {c["player_id"]: _points(rows, c["player_id"]) for c in team["squad"]}


async def test_values_change_when_the_round_settles(
    client: AsyncClient, login: Login, make_player: MakePlayer, clock: Clock
) -> None:
    headers, match_id, team = await _round_with_lineup(client, login, make_player)
    clock.now = SETTLED
    rows = await _stats(client, headers, match_id)

    after = await me(client, headers)

    for entry in after["squad"]:
        row = rows.get(entry["player_id"])
        expected = next_value(
            INITIAL_PLAYER_VALUE, row["rating"] if row else None, row["goals"] if row else 0
        )
        assert entry["value"] == expected
        assert entry["value_change"] == expected - INITIAL_PLAYER_VALUE
    assert after["me"]["team_value"] == sum(c["value"] for c in after["squad"])
    listing_values = {x["player_id"]: x["value"] for x in await market(client, headers)}
    for player_id, value in listing_values.items():
        row = rows.get(player_id)
        assert value == next_value(
            INITIAL_PLAYER_VALUE, row["rating"] if row else None, row["goals"] if row else 0
        )


def _without_last_points(view: dict[str, Any]) -> dict[str, Any]:
    squad = [{k: v for k, v in c.items() if k != "last_points"} for c in view["squad"]]
    return {**{k: v for k, v in view.items() if k != "last_round"}, "squad": squad}


async def test_correcting_stats_after_the_close_does_not_change_frozen_points(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    session: AsyncSession,
) -> None:
    headers, match_id, _ = await _round_with_lineup(client, login, make_player)
    clock.now = SETTLED
    before = await _standings(client, headers)
    before_detail = await _detail(client, headers, match_id)
    before_me = await me(client, headers)

    # Reabrir el partido (sin tramos ya no está cerrado): recalculado puntuaría 0.
    await session.execute(delete(StintRow).where(StintRow.match_id == before_detail["match_id"]))
    await session.flush()

    assert await _standings(client, headers) == before
    assert await _detail(client, headers, match_id) == before_detail
    # Los puntos de la última jornada en la plantilla son informativos y se calculan al momento.
    assert _without_last_points(await me(client, headers)) == _without_last_points(before_me)


async def test_settling_waits_for_the_match_to_close(
    client: AsyncClient, login: Login, make_player: MakePlayer, clock: Clock
) -> None:
    headers, match_id, _ = await _round_with_lineup(client, login, make_player, finalize=False)
    clock.now = SETTLED

    pending = await _standings(client, headers)
    await client.post(f"/matches/{match_id}/finalize", headers=headers)
    settled = await _standings(client, headers)

    assert pending["rounds"][0]["status"] == "pending"
    assert settled["rounds"][0]["status"] == "settled"
    assert (await me(client, headers))["me"]["balance"] > INITIAL_BALANCE


async def test_a_round_with_incoherent_events_does_not_lock_the_league_until_fixed(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    session: AsyncSession,
) -> None:
    headers, match_id, _ = await _round_with_lineup(client, login, make_player)
    broken = await _undo_twice(client, session, headers, match_id)
    clock.now = SETTLED
    await me(client, headers)  # abre el mercado de hoy: ya no queda nada procesable

    # Sin pasos procesables no se bloquea la liga ni se confirma nada en cada petición.
    idle = await catch_up(session, SETTLED, random.Random(1))
    pending = await _standings(client, headers)
    await session.delete(broken)
    await session.flush()
    settled = await _standings(client, headers)

    assert idle is False
    assert pending["rounds"][0]["status"] == "pending"
    assert settled["rounds"][0]["status"] == "settled"
    assert (await me(client, headers))["me"]["balance"] > INITIAL_BALANCE


async def test_settling_runs_once(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    session: AsyncSession,
) -> None:
    headers, _, _ = await _round_with_lineup(client, login, make_player)
    clock.now = SETTLED

    first = await me(client, headers)
    await _standings(client, headers)
    second = await me(client, headers)

    payouts = await session.scalar(select(func.count()).select_from(FantasyLedgerEntry))
    assert first["me"]["balance"] == second["me"]["balance"]
    assert payouts == 1


async def test_a_copy_sold_before_the_lock_scores_zero_for_the_seller(
    client: AsyncClient, login: Login, make_player: MakePlayer, clock: Clock
) -> None:
    headers, match_id, team = await _round_with_lineup(client, login, make_player)
    sold, kept = team["squad"]
    clock.now = BEFORE_LOCK
    await client.post(f"/fantasy/copies/{sold['copy_id']}/sell", headers=headers)
    clock.now = MATCH_EVENING
    rows = await _stats(client, headers, match_id)

    detail = await _detail(client, headers, match_id)

    by_copy = {s["copy_id"]: s for s in detail["slots"] if s["copy_id"]}
    assert by_copy[sold["copy_id"]]["points"] == 0
    assert by_copy[kept["copy_id"]]["points"] == _points(rows, kept["player_id"])
    assert detail["total"] == _points(rows, kept["player_id"])


async def test_a_copy_sold_after_the_lock_keeps_its_points(
    client: AsyncClient, login: Login, make_player: MakePlayer, clock: Clock
) -> None:
    headers, match_id, team = await _round_with_lineup(client, login, make_player)
    clock.now = AFTER_LOCK
    await client.post(f"/fantasy/copies/{team['squad'][0]['copy_id']}/sell", headers=headers)
    clock.now = SETTLED
    rows = await _stats(client, headers, match_id)

    detail = await _detail(client, headers, match_id)

    assert detail["total"] == sum(_points(rows, c["player_id"]) for c in team["squad"])


async def test_a_negative_balance_at_the_lock_scores_zero(
    client: AsyncClient, login: Login, make_player: MakePlayer, clock: Clock
) -> None:
    headers, match_id, team = await _round_with_lineup(client, login, make_player)
    first, second = buyable(await market(client, headers), team)[:2]
    await bid(client, headers, first["listing_id"], 15000)
    await bid(client, headers, second["listing_id"], 15000)
    clock.now = MATCH_EVENING

    provisional = await _detail(client, headers, match_id)
    clock.now = SETTLED
    detail = await _detail(client, headers, match_id)
    standings = await _standings(client, headers)

    assert provisional["negative_balance"] is True and provisional["total"] == 0
    assert detail["negative_balance"] is True
    assert detail["total"] == 0 and detail["payout"] == 0
    assert standings["rows"][0]["points_by_round"] == {match_id: 0}
    assert (await me(client, headers))["me"]["balance"] == INITIAL_BALANCE - 30000


async def test_an_open_round_previews_my_current_lineup_without_sold_copies(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers, match_id, team = await _round_with_lineup(client, login, make_player)
    sold, kept = team["squad"]
    await client.post(f"/fantasy/copies/{sold['copy_id']}/sell", headers=headers)

    detail = await _detail(client, headers, match_id)

    assert detail["status"] == "pending"
    assert detail["total"] == 0 and detail["payout"] == 0
    assert [s["copy_id"] for s in detail["slots"][1:3]] == [None, kept["copy_id"]]


async def test_a_late_participant_has_no_points_in_rounds_settled_before_joining(
    client: AsyncClient, login: Login, make_player: MakePlayer, clock: Clock
) -> None:
    coach, match_id, _ = await _round_with_lineup(client, login, make_player)
    clock.now = SETTLED
    await _standings(client, coach)  # cierra la jornada
    late = await login(Role.ASSISTANT_COACH)

    detail = await _detail(client, late, match_id)
    standings = await _standings(client, late)

    assert detail["status"] == "settled"
    assert detail["total"] == 0 and detail["payout"] == 0
    assert all(s["copy_id"] is None for s in detail["slots"])
    late_row = next(r for r in standings["rows"] if r["display_name"] == "assistant_coach")
    assert late_row["points_by_round"] == {match_id: 0}
