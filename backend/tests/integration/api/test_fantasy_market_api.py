"""Fantasy, paso 3: mercado diario de la banca, pujas, ventas entre participantes y a la banca.

Contrato: `docs/fantasy-api-paso3.md`. El reloj y el azar se inyectan (`get_now`, `get_rng`).
"""

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import FantasyCopy
from app.domain.fantasy.rules import (
    INITIAL_BALANCE,
    INITIAL_PLAYER_VALUE,
    MARKET_DAILY_SIZE,
    MARKET_FIRST_WEEK_SIZE,
    SQUAD_LIMIT,
)
from app.domain.roles import Role
from tests.integration.api.conftest import Join, Login, MakePlayer
from tests.integration.api.fantasy_support import (
    FIRST_MARKET_CLOSES,
    LEAGUE_DAY,
    NEXT_DAY,
    Clock,
    bid,
    buyable,
    create_league,
    fantasy_client,
    field_players,
    give_copies,
    market,
    me,
    parse,
    transfers,
)

Headers = dict[str, str]


@pytest.fixture
def clock() -> Clock:
    return Clock(LEAGUE_DAY)


@pytest.fixture
async def client(session: AsyncSession, clock: Clock) -> AsyncIterator[AsyncClient]:
    async for http in fantasy_client(session, clock):
        yield http


async def _two_participants(
    client: AsyncClient, join: Join, staff: Headers, make_player: MakePlayer
) -> tuple[Headers, Headers]:
    await field_players(make_player)
    coach = await join()
    assistant = await join("assistant_coach")
    await create_league(client, staff)
    return coach, assistant


# --- Mercado de la banca -------------------------------------------------------------------------


async def test_the_first_market_has_fifteen_bank_copies_until_midnight(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, _ = await _two_participants(client, join, staff, make_player)

    listings = await market(client, coach)

    assert len(listings) == MARKET_FIRST_WEEK_SIZE
    assert len({x["copy_id"] for x in listings}) == MARKET_FIRST_WEEK_SIZE
    first = listings[0]
    assert set(first) == {
        "listing_id", "copy_id", "player_id", "name", "dorsal", "position", "value",
        "min_bid", "seller", "closes_at", "my_bid", "mine", "photo_url", "recent_points",
    }  # fmt: skip
    assert all(x["seller"] is None and x["mine"] is False for x in listings)
    assert all(x["my_bid"] is None for x in listings)
    assert {x["value"] for x in listings} == {INITIAL_PLAYER_VALUE}
    assert {x["min_bid"] for x in listings} == {INITIAL_PLAYER_VALUE}
    assert {parse(x["closes_at"]) for x in listings} == {FIRST_MARKET_CLOSES}
    assert [x["name"] for x in listings] == sorted(x["name"] for x in listings)


async def test_the_bank_never_lists_owned_copies(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, assistant = await _two_participants(client, join, staff, make_player)

    listings = await market(client, coach)

    owned = {c["copy_id"] for h in (coach, assistant) for c in (await me(client, h))["squad"]}
    assert not owned & {x["copy_id"] for x in listings}


async def test_the_market_is_created_once_a_day(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, assistant = await _two_participants(client, join, staff, make_player)
    first = {x["listing_id"] for x in await market(client, coach)}

    again = {x["listing_id"] for x in await market(client, assistant)}
    clock.now = NEXT_DAY
    tomorrow = {x["listing_id"] for x in await market(client, coach)}

    assert first == again
    assert len(tomorrow) == MARKET_FIRST_WEEK_SIZE
    assert not first & tomorrow


async def test_after_the_first_week_the_market_has_eight_copies(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, _ = await _two_participants(client, join, staff, make_player)

    clock.now = LEAGUE_DAY + timedelta(days=7)

    assert len(await market(client, coach)) == MARKET_DAILY_SIZE


async def test_a_day_without_visits_has_no_market(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, _ = await _two_participants(client, join, staff, make_player)
    await market(client, coach)

    clock.now = LEAGUE_DAY + timedelta(days=3)
    listings = await market(client, coach)

    # Solo el mercado de hoy, sin los atrasados de los días 11 y 12.
    assert {parse(x["closes_at"]) for x in listings} == {FIRST_MARKET_CLOSES + timedelta(days=3)}


# --- Pujas ---------------------------------------------------------------------------------------


async def test_a_bid_can_be_placed_changed_and_withdrawn(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, _ = await _two_participants(client, join, staff, make_player)
    target = buyable(await market(client, coach), await me(client, coach))[0]
    listing_id = target["listing_id"]

    placed = await bid(client, coach, listing_id, 4500)
    changed = await bid(client, coach, listing_id, 5000)
    withdrawn = await client.delete(f"/fantasy/market/{listing_id}/bid", headers=coach)
    again = await client.delete(f"/fantasy/market/{listing_id}/bid", headers=coach)

    assert placed.status_code == 200, placed.text
    assert placed.json()["data"] == {**target, "my_bid": 4500}
    assert changed.json()["data"]["my_bid"] == 5000
    assert withdrawn.status_code == 204
    assert again.status_code == 404
    mine = {x["listing_id"]: x for x in await market(client, coach)}
    assert mine[listing_id]["my_bid"] is None


async def test_bids_are_sealed(
    client: AsyncClient, login: Login, make_player: MakePlayer, join: Join, staff: dict[str, str]
) -> None:
    coach, assistant = await _two_participants(client, join, staff, make_player)
    target = buyable(await market(client, coach), await me(client, coach))[0]
    await bid(client, coach, target["listing_id"], 6000)

    seen = {x["listing_id"]: x for x in await market(client, assistant)}

    assert seen[target["listing_id"]]["my_bid"] is None
    assert seen[target["listing_id"]]["min_bid"] == INITIAL_PLAYER_VALUE


@pytest.mark.parametrize(
    ("amount", "status", "code"),
    [
        (INITIAL_PLAYER_VALUE - 1, 422, "bid_too_low"),
        (INITIAL_BALANCE + 1, 422, "insufficient_balance"),
        (-1, 422, "validation_error"),
        (1_000_001, 422, "validation_error"),
    ],
)
async def test_invalid_bid_amounts_are_rejected(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    amount: int,
    status: int,
    code: str,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, _ = await _two_participants(client, join, staff, make_player)
    target = buyable(await market(client, coach), await me(client, coach))[0]

    response = await bid(client, coach, target["listing_id"], amount)

    assert response.status_code == status
    assert response.json()["error"]["code"] == code


async def test_bid_body_rejects_unknown_fields(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, _ = await _two_participants(client, join, staff, make_player)
    target = (await market(client, coach))[0]

    response = await client.put(
        f"/fantasy/market/{target['listing_id']}/bid",
        json={"amount": 5000, "participant_id": str(uuid.uuid4())},
        headers=coach,
    )

    assert response.status_code == 422


async def test_bidding_on_an_unknown_or_closed_listing_is_404(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, _ = await _two_participants(client, join, staff, make_player)
    target = (await market(client, coach))[0]

    unknown = await bid(client, coach, str(uuid.uuid4()), 5000)
    clock.now = NEXT_DAY
    closed = await bid(client, coach, target["listing_id"], 5000)

    assert unknown.status_code == 404
    assert closed.status_code == 404
    assert closed.json()["error"]["code"] == "not_found"


async def test_a_full_squad_cannot_bid(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    session: AsyncSession,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, _ = await _two_participants(client, join, staff, make_player)
    mine = await me(client, coach)
    await give_copies(session, mine["me"]["participant_id"], SQUAD_LIMIT - 2, LEAGUE_DAY)
    # Cualquier venta de la banca: la plantilla llena se comprueba antes que el jugador repetido,
    # y con 7 jugadores propios el sorteo puede no dejar ninguno libre.
    target = next(lst for lst in await market(client, coach) if lst["seller"] is None)

    response = await bid(client, coach, target["listing_id"], 5000)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "squad_full"


async def test_a_copy_of_a_player_i_have_cannot_be_bid_for(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, assistant = await _two_participants(client, join, staff, make_player)
    coach_team, assistant_team = await me(client, coach), await me(client, assistant)
    listings = await market(client, coach)
    mine = {c["player_id"] for c in coach_team["squad"]}
    same = [x for x in listings if x["player_id"] in mine]
    if not same:  # el sorteo no sacó ninguno: el asistente pone a la venta uno que tengo
        shared = next((c for c in assistant_team["squad"] if c["player_id"] in mine), None)
        assert shared is not None, "el sorteo no dejó jugadores en común"
        posted = await client.post(
            f"/fantasy/copies/{shared['copy_id']}/listing", json={}, headers=assistant
        )
        same = [posted.json()["data"]]

    response = await bid(client, coach, same[0]["listing_id"], 5000)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "duplicate_player"


async def test_bidding_on_a_listing_whose_copy_changed_owner_is_404(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    session: AsyncSession,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, assistant = await _two_participants(client, join, staff, make_player)
    # Un jugador que no tiene ninguno de los dos: si no, chocaría con la copia única por dueño.
    squads = (await me(client, coach), await me(client, assistant))
    target = buyable(await market(client, coach), *squads)[0]
    # Un fallo de datos le da la copia en venta de la banca a otro participante.
    copy = await session.get(FantasyCopy, uuid.UUID(target["copy_id"]))
    assert copy is not None
    copy.owner_id = uuid.UUID((await me(client, assistant))["me"]["participant_id"])
    copy.acquired_at, copy.clause = LEAGUE_DAY, 6000
    await session.flush()

    response = await bid(client, coach, target["listing_id"], 5000)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


# --- Cierre de una venta -------------------------------------------------------------------------


async def test_the_highest_bid_wins_when_the_listing_closes(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, assistant = await _two_participants(client, join, staff, make_player)
    coach_team, assistant_team = await me(client, coach), await me(client, assistant)
    target = buyable(await market(client, coach), coach_team, assistant_team)[0]
    await bid(client, coach, target["listing_id"], 4500)
    await bid(client, assistant, target["listing_id"], 5200)

    clock.now = NEXT_DAY
    winner, loser = await me(client, assistant), await me(client, coach)

    assert target["copy_id"] in {c["copy_id"] for c in winner["squad"]}
    assert winner["me"]["balance"] == INITIAL_BALANCE - 5200
    assert loser["me"]["balance"] == INITIAL_BALANCE
    [move] = await transfers(client, coach)
    assert move == {
        "at": move["at"],
        "kind": "market",
        "player_id": target["player_id"],
        "name": target["name"],
        "from": None,
        "to": {
            "participant_id": winner["me"]["participant_id"],
            "display_name": "assistant_coach",
        },
        "price": 5200,
    }
    assert parse(move["at"]) == FIRST_MARKET_CLOSES


async def test_the_clause_of_a_copy_bought_dear_is_above_what_was_paid(
    client: AsyncClient,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, assistant = await _two_participants(client, join, staff, make_player)
    coach_team, assistant_team = await me(client, coach), await me(client, assistant)
    target = buyable(await market(client, coach), coach_team, assistant_team)[0]
    await bid(client, coach, target["listing_id"], 8000)

    clock.now = NEXT_DAY
    bought = next(
        c for c in (await me(client, coach))["squad"] if c["copy_id"] == target["copy_id"]
    )

    assert bought["value"] * 3 // 2 < 8000
    assert bought["clause"] == 10000  # 1,25 × 8 M, no 1,5 × su valor


async def test_on_a_tie_the_oldest_bid_wins_and_changing_a_bid_loses_seniority(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, assistant = await _two_participants(client, join, staff, make_player)
    coach_team, assistant_team = await me(client, coach), await me(client, assistant)
    first, second = buyable(await market(client, coach), coach_team, assistant_team)[:2]
    await bid(client, coach, first["listing_id"], 5000)
    await bid(client, coach, second["listing_id"], 5000)
    clock.now = LEAGUE_DAY + timedelta(minutes=5)
    await bid(client, assistant, first["listing_id"], 5000)
    await bid(client, assistant, second["listing_id"], 5000)
    clock.now = LEAGUE_DAY + timedelta(minutes=10)
    await bid(client, coach, second["listing_id"], 5000)  # la cambia: ahora es la más nueva

    clock.now = NEXT_DAY
    coach_copies = {c["copy_id"] for c in (await me(client, coach))["squad"]}
    assistant_copies = {c["copy_id"] for c in (await me(client, assistant))["squad"]}

    assert first["copy_id"] in coach_copies
    assert second["copy_id"] in assistant_copies


async def test_bids_of_full_squads_are_skipped_at_the_close(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    session: AsyncSession,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, assistant = await _two_participants(client, join, staff, make_player)
    coach_team, assistant_team = await me(client, coach), await me(client, assistant)
    target = buyable(await market(client, coach), coach_team, assistant_team)[0]
    await bid(client, coach, target["listing_id"], 9000)
    await bid(client, assistant, target["listing_id"], 4000)
    await give_copies(session, coach_team["me"]["participant_id"], SQUAD_LIMIT - 2, LEAGUE_DAY)

    clock.now = NEXT_DAY
    assistant_copies = {c["copy_id"] for c in (await me(client, assistant))["squad"]}

    assert target["copy_id"] in assistant_copies
    assert (await me(client, coach))["me"]["balance"] == INITIAL_BALANCE


async def test_bids_may_leave_the_balance_negative(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, _ = await _two_participants(client, join, staff, make_player)
    first, second = buyable(await market(client, coach), await me(client, coach))[:2]
    await bid(client, coach, first["listing_id"], 15000)
    await bid(client, coach, second["listing_id"], 15000)

    clock.now = NEXT_DAY
    team = await me(client, coach)

    assert team["me"]["balance"] == INITIAL_BALANCE - 30000
    assert len(team["squad"]) == 4


# --- Ventas de un participante -------------------------------------------------------------------


async def test_a_participant_lists_a_copy_and_the_best_bidder_pays_him(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, assistant = await _two_participants(client, join, staff, make_player)
    coach_team, assistant_team = await me(client, coach), await me(client, assistant)
    theirs = {c["player_id"] for c in assistant_team["squad"]}
    copy = next(c for c in coach_team["squad"] if c["player_id"] not in theirs)

    posted = await client.post(
        f"/fantasy/copies/{copy['copy_id']}/listing", json={"min_price": 5000}, headers=coach
    )
    listing = posted.json()["data"]
    seen = {x["listing_id"]: x for x in await market(client, assistant)}[listing["listing_id"]]
    squad_entry = {c["copy_id"]: c for c in (await me(client, coach))["squad"]}[copy["copy_id"]]
    low = await bid(client, assistant, listing["listing_id"], 4999)
    own = await bid(client, coach, listing["listing_id"], 6000)
    await bid(client, assistant, listing["listing_id"], 5000)

    assert posted.status_code == 201, posted.text
    assert listing["mine"] is True and listing["min_bid"] == 5000
    assert listing["seller"] == {
        "participant_id": coach_team["me"]["participant_id"],
        "display_name": "head_coach",
    }
    assert parse(listing["closes_at"]) == LEAGUE_DAY + timedelta(hours=24)
    assert seen["mine"] is False and seen["min_bid"] == 5000
    assert squad_entry["listing"] == {
        "listing_id": listing["listing_id"],
        "min_price": 5000,
        "closes_at": listing["closes_at"],
    }
    assert low.json()["error"]["code"] == "bid_too_low"
    assert own.status_code == 409 and own.json()["error"]["code"] == "own_listing"

    clock.now = LEAGUE_DAY + timedelta(hours=24)
    seller, buyer = await me(client, coach), await me(client, assistant)
    assert copy["copy_id"] not in {c["copy_id"] for c in seller["squad"]}
    assert copy["copy_id"] in {c["copy_id"] for c in buyer["squad"]}
    assert seller["me"]["balance"] == INITIAL_BALANCE + 5000
    assert buyer["me"]["balance"] == INITIAL_BALANCE - 5000


async def test_a_listed_copy_can_still_be_lined_up(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, _ = await _two_participants(client, join, staff, make_player)
    copy = (await me(client, coach))["squad"][0]
    await client.post(f"/fantasy/copies/{copy['copy_id']}/listing", json={}, headers=coach)

    response = await client.put(
        "/fantasy/lineup", json={"field_copy_ids": [copy["copy_id"]]}, headers=coach
    )

    assert response.status_code == 200


async def test_a_listing_without_bids_keeps_the_copy(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, _ = await _two_participants(client, join, staff, make_player)
    copy = (await me(client, coach))["squad"][0]
    await client.post(
        f"/fantasy/copies/{copy['copy_id']}/listing", json={"min_price": None}, headers=coach
    )

    clock.now = LEAGUE_DAY + timedelta(hours=25)
    team = await me(client, coach)

    entry = {c["copy_id"]: c for c in team["squad"]}[copy["copy_id"]]
    assert entry["listing"] is None
    assert await transfers(client, coach) == []


async def test_listing_errors(
    client: AsyncClient, login: Login, make_player: MakePlayer, join: Join, staff: dict[str, str]
) -> None:
    coach, assistant = await _two_participants(client, join, staff, make_player)
    copy = (await me(client, coach))["squad"][0]
    path = f"/fantasy/copies/{copy['copy_id']}/listing"
    await client.post(path, json={}, headers=coach)

    twice = await client.post(path, json={}, headers=coach)
    not_mine = await client.post(path, json={}, headers=assistant)
    unknown = await client.post(f"/fantasy/copies/{uuid.uuid4()}/listing", json={}, headers=coach)
    too_much = await client.post(
        f"/fantasy/copies/{(await me(client, coach))['squad'][1]['copy_id']}/listing",
        json={"min_price": 1_000_001},
        headers=coach,
    )

    assert twice.status_code == 409 and twice.json()["error"]["code"] == "already_listed"
    assert not_mine.status_code == 404
    assert unknown.status_code == 404
    assert too_much.status_code == 422


async def test_withdrawing_a_listing_voids_its_bids(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, assistant = await _two_participants(client, join, staff, make_player)
    coach_team, assistant_team = await me(client, coach), await me(client, assistant)
    theirs = {c["player_id"] for c in assistant_team["squad"]}
    copy = next(c for c in coach_team["squad"] if c["player_id"] not in theirs)
    path = f"/fantasy/copies/{copy['copy_id']}/listing"
    listing = (await client.post(path, json={}, headers=coach)).json()["data"]
    await bid(client, assistant, listing["listing_id"], 6000)

    withdrawn = await client.delete(path, headers=coach)
    again = await client.delete(path, headers=coach)
    late_bid = await bid(client, assistant, listing["listing_id"], 7000)

    assert withdrawn.status_code == 204
    assert again.status_code == 404
    assert late_bid.status_code == 404
    assert listing["listing_id"] not in {x["listing_id"] for x in await market(client, coach)}
    clock.now = LEAGUE_DAY + timedelta(hours=25)
    assert copy["copy_id"] in {c["copy_id"] for c in (await me(client, coach))["squad"]}


# --- Venta a la banca ----------------------------------------------------------------------------


async def test_selling_to_the_bank_pays_seventy_percent_at_once(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, assistant = await _two_participants(client, join, staff, make_player)
    team = await me(client, coach)
    copy = team["squad"][0]
    await client.put("/fantasy/lineup", json={"field_copy_ids": [copy["copy_id"]]}, headers=coach)
    await client.post(f"/fantasy/copies/{copy['copy_id']}/listing", json={}, headers=coach)

    sold = await client.post(f"/fantasy/copies/{copy['copy_id']}/sell", headers=coach)
    again = await client.post(f"/fantasy/copies/{copy['copy_id']}/sell", headers=coach)
    after = await me(client, coach)

    assert sold.status_code == 200, sold.text
    assert sold.json()["data"] == {"price": 2800, "balance": INITIAL_BALANCE + 2800}
    assert again.status_code == 404
    assert copy["copy_id"] not in {c["copy_id"] for c in after["squad"]}
    assert after["lineup"]["field_copy_ids"] == [None] * 4
    assert copy["copy_id"] not in {x["copy_id"] for x in await market(client, assistant)}
    [move] = await transfers(client, assistant)
    assert move["kind"] == "bank_sale" and move["to"] is None and move["price"] == 2800
    assert move["from"]["display_name"] == "head_coach"


async def test_selling_a_copy_that_is_not_mine_is_404(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, assistant = await _two_participants(client, join, staff, make_player)
    copy = (await me(client, assistant))["squad"][0]

    response = await client.post(f"/fantasy/copies/{copy['copy_id']}/sell", headers=coach)

    assert response.status_code == 404


# --- Mi equipo con el mercado --------------------------------------------------------------------


async def test_me_shows_values_limit_and_team_value(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, _ = await _two_participants(client, join, staff, make_player)

    team = await me(client, coach)

    assert team["me"]["squad_limit"] == SQUAD_LIMIT
    assert team["me"]["team_value"] == 2 * INITIAL_PLAYER_VALUE
    entry = team["squad"][0]
    assert entry["value"] == INITIAL_PLAYER_VALUE
    assert entry["value_change"] == 0
    assert entry["listing"] is None


# --- Sin liga y transferencias -------------------------------------------------------------------


async def test_without_league_the_market_routes_are_404(
    client: AsyncClient, login: Login, join: Join
) -> None:
    headers = await join()
    some = str(uuid.uuid4())

    responses = [
        await client.get("/fantasy/market", headers=headers),
        await client.get("/fantasy/transfers", headers=headers),
        await bid(client, headers, some, 5000),
        await client.delete(f"/fantasy/market/{some}/bid", headers=headers),
        await client.post(f"/fantasy/copies/{some}/listing", json={}, headers=headers),
        await client.delete(f"/fantasy/copies/{some}/listing", headers=headers),
        await client.post(f"/fantasy/copies/{some}/sell", headers=headers),
    ]

    assert [r.status_code for r in responses] == [404] * len(responses)
    assert {r.json()["error"]["code"] for r in responses} == {"not_found"}


async def test_the_initial_deal_is_not_a_transfer(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    join: Join,
    staff: dict[str, str],
) -> None:
    coach, _ = await _two_participants(client, join, staff, make_player)

    assert await transfers(client, coach) == []


async def test_players_use_the_market(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    clock: Clock,
    join: Join,
    staff: dict[str, str],
) -> None:
    await field_players(make_player)
    await join()
    await create_league(client, staff)
    player = await make_player(40, name="Dani")
    headers = await login(Role.PLAYER, player_id=player.id)
    team = await me(client, headers)
    target = buyable(await market(client, headers), team)[0]

    response = await bid(client, headers, target["listing_id"], 4000)
    clock.now = datetime(2026, 10, 11, 9, 0, tzinfo=UTC)

    assert response.status_code == 200
    assert target["copy_id"] in {c["copy_id"] for c in (await me(client, headers))["squad"]}
