"""Fantasy, paso 4: cláusulas de rescisión (ver, subir y clausulazo).

Contrato: `docs/fantasy-api-paso4.md`. La liga empieza el 10/10/2026; las copias del reparto quedan
protegidas 7 días, hasta el 17/10 a la misma hora. El reloj por defecto es el 20/10 (sin partido).
"""

from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.fantasy.rules import CLAUSE_PROTECTION_DAYS, INITIAL_BALANCE, INITIAL_PLAYER_VALUE
from tests.integration.api.conftest import Join, Login, MakePlayer
from tests.integration.api.fantasy_support import (
    LEAGUE_DAY,
    Clock,
    create_league,
    fantasy_client,
    field_players,
    get_data,
    market,
    me,
    parse,
    transfers,
)

Headers = dict[str, str]
FREE_DAY = datetime(2026, 10, 20, 10, 0, tzinfo=UTC)
INITIAL_CLAUSE = INITIAL_PLAYER_VALUE * 3 // 2


@pytest.fixture
def clock() -> Clock:
    return Clock(LEAGUE_DAY)


@pytest.fixture
async def client(session: AsyncSession, clock: Clock) -> AsyncIterator[AsyncClient]:
    async for http in fantasy_client(session, clock):
        yield http


async def _league(
    client: AsyncClient, join: Join, staff: Headers, make_player: MakePlayer, clock: Clock
) -> tuple[Headers, Headers]:
    """Liga del 10/10 con dos participantes; el reloj pasa al 20/10."""
    await field_players(make_player)
    coach = await join()
    assistant = await join("assistant_coach")
    await create_league(client, staff)
    await me(client, assistant)
    clock.now = FREE_DAY
    return coach, assistant


async def _target(client: AsyncClient, buyer: Headers, owner: Headers) -> dict[str, Any]:
    """Una copia de `owner` de un jugador que `buyer` no tiene (el reparto es al azar)."""
    have = {c["player_id"] for c in (await me(client, buyer))["squad"]}
    squad = (await me(client, owner))["squad"]
    return next(c for c in squad if c["player_id"] not in have)


async def _clauses(client: AsyncClient, headers: Headers) -> dict[str, Any]:
    data: dict[str, Any] = await get_data(client, "/fantasy/clauses", headers)
    return data


async def _buy(client: AsyncClient, headers: Headers, copy_id: str) -> Response:
    return await client.post(f"/fantasy/copies/{copy_id}/clause/buy", headers=headers)


async def _raise(client: AsyncClient, headers: Headers, copy_id: str, clause: int) -> Response:
    return await client.put(
        f"/fantasy/copies/{copy_id}/clause", json={"clause": clause}, headers=headers
    )


def _error(response: Response) -> tuple[int, str]:
    return response.status_code, response.json()["error"]["code"]


# --- Ver -----------------------------------------------------------------------------------------


async def test_my_squad_shows_the_clause_and_the_protection_end(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, _ = await _league(client, join, staff, make_player, clock)

    squad = (await me(client, coach))["squad"]

    assert {c["clause"] for c in squad} == {INITIAL_CLAUSE}
    expected_end = LEAGUE_DAY + timedelta(days=CLAUSE_PROTECTION_DAYS)
    assert {parse(c["protected_until"]) for c in squad} == {expected_end}


async def test_the_clause_list_has_every_owned_copy_with_its_owner(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, assistant = await _league(client, join, staff, make_player, clock)
    mine = {c["copy_id"] for c in (await me(client, coach))["squad"]}
    theirs = {c["copy_id"] for c in (await me(client, assistant))["squad"]}

    data = await _clauses(client, coach)

    assert data["match_day"] is False
    copies = {c["copy_id"]: c for c in data["copies"]}
    assert set(copies) == mine | theirs
    assert all(copies[c]["mine"] for c in mine)
    assert not any(copies[c]["mine"] for c in theirs)
    sample = copies[next(iter(theirs))]
    assert set(sample) == {
        "copy_id", "player_id", "name", "dorsal", "position", "value", "clause", "owner",
        "protected_until", "mine", "photo_url", "recent_points",
    }  # fmt: skip
    assert sample["clause"] == INITIAL_CLAUSE
    assert (
        sample["owner"]["participant_id"] == (await me(client, assistant))["me"]["participant_id"]
    )


# --- Clausulazo ----------------------------------------------------------------------------------


async def test_a_clause_buy_moves_the_copy_and_the_money_at_once(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, assistant = await _league(client, join, staff, make_player, clock)
    target = await _target(client, coach, assistant)

    response = await _buy(client, coach, target["copy_id"])

    assert response.status_code == 200
    assert response.json()["data"] == {
        "price": INITIAL_CLAUSE,
        "balance": INITIAL_BALANCE - INITIAL_CLAUSE,
    }
    buyer = await me(client, coach)
    bought = next(c for c in buyer["squad"] if c["copy_id"] == target["copy_id"])
    # Pagó la cláusula entera: la nueva es 1,25 × lo pagado, por encima de 1,5 × el valor.
    assert bought["clause"] == INITIAL_CLAUSE * 5 // 4
    assert parse(bought["protected_until"]) == FREE_DAY + timedelta(days=CLAUSE_PROTECTION_DAYS)
    seller = await me(client, assistant)
    assert target["copy_id"] not in {c["copy_id"] for c in seller["squad"]}
    assert seller["me"]["balance"] == INITIAL_BALANCE + INITIAL_CLAUSE
    [last, *_] = await transfers(client, coach)
    assert (last["kind"], last["price"], last["player_id"]) == (
        "clause",
        INITIAL_CLAUSE,
        target["player_id"],
    )
    assert last["from"]["participant_id"] == seller["me"]["participant_id"]


async def test_a_copy_is_protected_for_seven_days_after_it_arrives(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, assistant = await _league(client, join, staff, make_player, clock)
    target = await _target(client, coach, assistant)
    clock.now = LEAGUE_DAY + timedelta(days=CLAUSE_PROTECTION_DAYS) - timedelta(minutes=1)

    assert _error(await _buy(client, coach, target["copy_id"])) == (409, "clause_protected")


async def test_a_bought_copy_is_protected_again_for_the_new_owner(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, assistant = await _league(client, join, staff, make_player, clock)
    target = await _target(client, coach, assistant)
    await _buy(client, coach, target["copy_id"])

    assert _error(await _buy(client, assistant, target["copy_id"])) == (409, "clause_protected")


async def test_no_clause_buys_on_a_match_day(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, assistant = await _league(client, join, staff, make_player, clock)
    await client.post(
        "/matches", json={"held_on": "2026-10-20", "opponent": "Rival FS"}, headers=staff
    )
    target = await _target(client, coach, assistant)

    assert (await _clauses(client, coach))["match_day"] is True
    assert _error(await _buy(client, coach, target["copy_id"])) == (409, "match_day")


async def test_my_own_copy_cannot_be_bought(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, _ = await _league(client, join, staff, make_player, clock)
    mine = (await me(client, coach))["squad"][0]

    assert _error(await _buy(client, coach, mine["copy_id"])) == (409, "own_copy")


async def test_a_bank_copy_has_no_clause_to_pay(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, _ = await _league(client, join, staff, make_player, clock)
    bank = next(x for x in await market(client, coach) if x["seller"] is None)

    assert _error(await _buy(client, coach, bank["copy_id"])) == (404, "not_found")


async def test_a_clause_buy_needs_balance_for_the_whole_clause(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, assistant = await _league(client, join, staff, make_player, clock)
    target = await _target(client, coach, assistant)
    await _raise(client, assistant, target["copy_id"], INITIAL_BALANCE + 1000)

    response = await _buy(client, coach, target["copy_id"])

    assert _error(response) == (422, "insufficient_balance")


async def test_a_clause_buy_cancels_the_sellers_listing(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, assistant = await _league(client, join, staff, make_player, clock)
    target = await _target(client, coach, assistant)
    await client.post(f"/fantasy/copies/{target['copy_id']}/listing", json={}, headers=assistant)

    assert (await _buy(client, coach, target["copy_id"])).status_code == 200

    assert target["copy_id"] not in {x["copy_id"] for x in await market(client, coach)}


# --- Subir la cláusula ---------------------------------------------------------------------------


async def test_raising_my_clause_costs_half_of_the_increase(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, _ = await _league(client, join, staff, make_player, clock)
    mine = (await me(client, coach))["squad"][0]

    response = await _raise(client, coach, mine["copy_id"], INITIAL_CLAUSE + 2001)

    assert response.status_code == 200
    assert response.json()["data"] == {
        "clause": INITIAL_CLAUSE + 2001,
        "cost": 1001,
        "balance": INITIAL_BALANCE - 1001,
    }
    squad = (await me(client, coach))["squad"]
    assert next(c for c in squad if c["copy_id"] == mine["copy_id"])["clause"] == (
        INITIAL_CLAUSE + 2001
    )


async def test_a_clause_cannot_be_lowered(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, _ = await _league(client, join, staff, make_player, clock)
    mine = (await me(client, coach))["squad"][0]

    response = await _raise(client, coach, mine["copy_id"], INITIAL_CLAUSE)

    assert _error(response) == (422, "clause_not_higher")


async def test_only_the_owner_can_raise_a_clause(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, assistant = await _league(client, join, staff, make_player, clock)
    theirs = (await me(client, assistant))["squad"][0]

    response = await _raise(client, coach, theirs["copy_id"], INITIAL_CLAUSE + 1000)

    assert _error(response) == (404, "not_found")


async def test_raising_needs_balance_for_the_cost(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, _ = await _league(client, join, staff, make_player, clock)
    mine = (await me(client, coach))["squad"][0]

    response = await _raise(
        client, coach, mine["copy_id"], INITIAL_CLAUSE + 2 * INITIAL_BALANCE + 2
    )

    assert _error(response) == (422, "insufficient_balance")
