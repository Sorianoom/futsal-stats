"""Cuentas del Fantasy del cuerpo técnico: invitación, cuentas de partidos que solo miran y
plantillas privadas (nadie ve qué fichan ni se los clausula, y ellas no clausulan)."""

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.roles import Role
from app.services.fantasy_market import ANONYMOUS_PARTICIPANT_ID
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
    transfers,
)

Headers = dict[str, str]
PASSWORD = "Otra-clave-muy-larga-1"
# Sin partidos: se puede clausular (la protección inicial ya pasó).
FREE_DAY = datetime(2026, 10, 20, 10, 0, tzinfo=UTC)


@pytest.fixture
def clock() -> Clock:
    return Clock(LEAGUE_DAY)


@pytest.fixture
async def client(session: AsyncSession, clock: Clock) -> AsyncIterator[AsyncClient]:
    async for http in fantasy_client(session, clock):
        yield http


async def _invite(client: AsyncClient, headers: Headers, name: str = "Bruno") -> Any:
    return await client.post(
        "/fantasy-accounts/invitation", json={"display_name": name}, headers=headers
    )


async def _accept(client: AsyncClient, token: str, email: str = "bruno@club.es") -> Any:
    return await client.post(
        "/auth/invitations/accept", json={"token": token, "email": email, "password": PASSWORD}
    )


async def _login(client: AsyncClient, email: str) -> Headers:
    response = await client.post("/auth/login", json={"email": email, "password": PASSWORD})
    return {"Authorization": f"Bearer {response.json()['data']['access_token']}"}


# --- Invitación ----------------------------------------------------------------------------------


async def test_the_head_coach_invites_a_fantasy_account_with_a_name(
    client: AsyncClient, staff: Headers
) -> None:
    invited = await _invite(client, staff, " Bruno ")

    accepted = await _accept(client, invited.json()["data"]["token"])

    assert invited.status_code == 201, invited.text
    assert accepted.status_code == 201, accepted.text
    user = accepted.json()["data"]
    assert (user["role"], user["player_id"], user["display_name"]) == ("fantasy", None, "Bruno")
    listed = await get_data(client, "/fantasy-accounts", staff)
    assert listed == [{"id": user["id"], "email": "bruno@club.es", "display_name": "Bruno"}]


async def test_an_invitation_is_used_once(client: AsyncClient, staff: Headers) -> None:
    token = (await _invite(client, staff)).json()["data"]["token"]
    await _accept(client, token)

    again = await _accept(client, token, email="otro@club.es")

    assert again.status_code == 400
    assert again.json()["error"]["code"] == "invalid_invitation"


async def test_only_the_head_coach_manages_fantasy_accounts(
    client: AsyncClient, login: Login, join: Join
) -> None:
    for headers in (await login(Role.ASSISTANT_COACH), await join()):
        assert (await _invite(client, headers)).status_code == 403
        assert (await client.get("/fantasy-accounts", headers=headers)).status_code == 403


async def test_the_name_must_not_be_blank(client: AsyncClient, staff: Headers) -> None:
    for bad in ("", "   ", "x" * 41):
        assert (await _invite(client, staff, bad)).status_code == 422, bad


async def test_a_deactivated_account_cannot_log_in(client: AsyncClient, staff: Headers) -> None:
    token = (await _invite(client, staff)).json()["data"]["token"]
    user_id = (await _accept(client, token)).json()["data"]["id"]

    removed = await client.delete(f"/fantasy-accounts/{user_id}", headers=staff)
    login = await client.post("/auth/login", json={"email": "bruno@club.es", "password": PASSWORD})

    assert removed.status_code == 204
    assert login.status_code == 401
    assert await get_data(client, "/fantasy-accounts", staff) == []


async def test_deleting_a_non_fantasy_account_is_404(client: AsyncClient, staff: Headers) -> None:
    coach = (await client.get("/auth/me", headers=staff)).json()["data"]

    for user_id in (coach["id"], str(uuid.uuid4())):
        response = await client.delete(f"/fantasy-accounts/{user_id}", headers=staff)
        assert response.status_code == 404


# --- Las cuentas de partidos del cuerpo técnico solo miran ----------------------------------------


async def test_a_staff_match_account_only_watches(
    client: AsyncClient, login: Login, join: Join, staff: Headers, make_player: MakePlayer
) -> None:
    await field_players(make_player)
    player = await join()
    league = await create_league(client, staff)
    assistant = await login(Role.ASSISTANT_COACH)

    watching = await me(client, assistant)
    standings = await get_data(client, "/fantasy/standings", assistant)
    lineup = await client.put("/fantasy/lineup", json={"field_copy_ids": []}, headers=assistant)
    listings = await client.get("/fantasy/market", headers=assistant)

    assert watching == {
        "league": {"id": league["id"], "starts_on": "2026-10-10"},
        "spectator": True,
    }
    assert league["participants"] == 1
    assert [r["display_name"] for r in standings["rows"]] == ["head_coach"]
    assert (await me(client, player))["me"]["display_name"] == "head_coach"
    assert (lineup.status_code, lineup.json()["error"]["code"]) == (403, "spectator")
    assert listings.status_code == 403


async def test_without_league_a_staff_account_sees_none(
    client: AsyncClient, staff: Headers
) -> None:
    assert await me(client, staff) == {"league": None}
    assert await get_data(client, "/fantasy/standings", staff) == {"rounds": [], "rows": []}


# --- Plantilla privada ---------------------------------------------------------------------------


async def _private_league(
    client: AsyncClient, staff: Headers, join: Join, make_player: MakePlayer, clock: Clock
) -> tuple[Headers, Headers]:
    """Liga con un jugador (plantilla pública) y la cuenta del Fantasy de Bruno (privada)."""
    await field_players(make_player)
    player = await join("Lucas")
    token = (await _invite(client, staff)).json()["data"]["token"]
    await _accept(client, token)
    bruno = await _login(client, "bruno@club.es")
    await create_league(client, staff)
    await me(client, player)
    clock.now = FREE_DAY
    return player, bruno


async def test_a_private_squad_is_flagged_in_me(
    client: AsyncClient, staff: Headers, join: Join, make_player: MakePlayer, clock: Clock
) -> None:
    player, bruno = await _private_league(client, staff, join, make_player, clock)

    assert (await me(client, bruno))["me"]["private_squad"] is True
    assert (await me(client, player))["me"]["private_squad"] is False


async def _started_round(
    client: AsyncClient, staff: Headers, make_player: MakePlayer, clock: Clock
) -> str:
    """Partido oficial del 17/10 ya empezado (su jornada queda bloqueada)."""
    created = await client.post(
        "/matches", json={"held_on": "2026-10-17", "opponent": "Rival FS"}, headers=staff
    )
    match_id = str(created.json()["data"]["id"])
    starters = [str((await make_player(40 + n)).id) for n in range(5)]
    payload = {"type": "part_started", "part": 1, "starters": starters}
    body = {
        "events": [],
        "ratings": [],
        "lineup_events": [{"id": str(uuid.uuid4()), "seq": 1, "payload": payload}],
    }
    started = await client.post(f"/matches/{match_id}/sync", json=body, headers=staff)
    assert started.status_code == 200, started.text
    return match_id


async def test_nobody_else_sees_the_round_lineup_of_a_private_squad(
    client: AsyncClient, staff: Headers, join: Join, make_player: MakePlayer, clock: Clock
) -> None:
    player, bruno = await _private_league(client, staff, join, make_player, clock)
    bruno_id = (await me(client, bruno))["me"]["participant_id"]
    match_id = await _started_round(client, staff, make_player, clock)

    hidden = await client.get(f"/fantasy/rounds/{match_id}/participants/{bruno_id}", headers=player)
    own = await client.get(f"/fantasy/rounds/{match_id}/participants/{bruno_id}", headers=bruno)

    assert hidden.status_code == 403
    assert hidden.json()["error"]["code"] == "private_squad"
    assert own.status_code == 200


async def test_nobody_sees_or_buys_the_clause_of_a_private_squad(
    client: AsyncClient, staff: Headers, join: Join, make_player: MakePlayer, clock: Clock
) -> None:
    player, bruno = await _private_league(client, staff, join, make_player, clock)
    hidden = (await me(client, bruno))["squad"][0]["copy_id"]

    seen = {c["copy_id"] for c in (await get_data(client, "/fantasy/clauses", player))["copies"]}
    own = {c["copy_id"] for c in (await get_data(client, "/fantasy/clauses", bruno))["copies"]}
    bought = await client.post(f"/fantasy/copies/{hidden}/clause/buy", headers=player)

    assert hidden not in seen
    assert hidden in own
    assert bought.status_code == 404


async def test_a_private_squad_does_not_pay_or_raise_clauses(
    client: AsyncClient, staff: Headers, join: Join, make_player: MakePlayer, clock: Clock
) -> None:
    player, bruno = await _private_league(client, staff, join, make_player, clock)
    theirs = (await me(client, player))["squad"][0]["copy_id"]
    mine = (await me(client, bruno))["squad"][0]["copy_id"]

    bought = await client.post(f"/fantasy/copies/{theirs}/clause/buy", headers=bruno)
    raised = await client.put(
        f"/fantasy/copies/{mine}/clause", json={"clause": 9000}, headers=bruno
    )

    for response in (bought, raised):
        assert (response.status_code, response.json()["error"]["code"]) == (403, "private_squad")


async def test_a_private_seller_is_anonymous(
    client: AsyncClient, staff: Headers, join: Join, make_player: MakePlayer, clock: Clock
) -> None:
    player, bruno = await _private_league(client, staff, join, make_player, clock)
    copy = (await me(client, bruno))["squad"][0]["copy_id"]
    await client.post(f"/fantasy/copies/{copy}/listing", json={}, headers=bruno)

    seen = next(x for x in await market(client, player) if x["copy_id"] == copy)
    own = next(x for x in await market(client, bruno) if x["copy_id"] == copy)

    assert seen["seller"] == {
        "participant_id": str(ANONYMOUS_PARTICIPANT_ID),
        "display_name": "Anónimo",
    }
    assert seen["mine"] is False
    assert own["seller"]["display_name"] == "Bruno"
    assert own["mine"] is True


async def test_the_moves_of_a_private_squad_are_hidden_from_the_rest(
    client: AsyncClient, staff: Headers, join: Join, make_player: MakePlayer, clock: Clock
) -> None:
    player, bruno = await _private_league(client, staff, join, make_player, clock)
    copy = (await me(client, bruno))["squad"][0]["copy_id"]
    sold = await client.post(f"/fantasy/copies/{copy}/sell", headers=bruno)

    assert sold.status_code == 200, sold.text
    assert await transfers(client, player) == []
    assert len(await transfers(client, bruno)) == 1


async def test_a_private_squad_is_hidden_when_opened_from_the_standings(
    client: AsyncClient, staff: Headers, join: Join, make_player: MakePlayer, clock: Clock
) -> None:
    player, bruno = await _private_league(client, staff, join, make_player, clock)
    bruno_id = (await me(client, bruno))["me"]["participant_id"]

    seen = await get_data(client, f"/fantasy/participants/{bruno_id}", player)
    own = await get_data(client, f"/fantasy/participants/{bruno_id}", bruno)

    assert seen == {
        "participant_id": bruno_id,
        "display_name": "Bruno",
        "private_squad": True,
        "team_value": None,
        "squad": [],
        "last_round": None,
        "last_lineup": None,
    }
    assert own["private_squad"] is True
    assert len(own["squad"]) > 0
