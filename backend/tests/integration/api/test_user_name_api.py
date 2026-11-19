"""Nombre visible de la cuenta: los entrenadores no tienen ficha de jugador con nombre."""

from httpx import AsyncClient

from app.domain.roles import Role
from tests.integration.api.conftest import Login, MakePlayer


async def test_without_name_the_account_has_none(client: AsyncClient, login: Login) -> None:
    headers = await login(Role.HEAD_COACH)

    response = await client.get("/auth/me", headers=headers)

    assert response.json()["data"]["display_name"] is None


async def test_the_head_coach_sets_his_name_and_the_fantasy_uses_it(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login(Role.HEAD_COACH)
    for dorsal in range(1, 7):
        await make_player(dorsal)

    response = await client.patch("/auth/me", json={"display_name": "  Bruno "}, headers=headers)
    await client.post("/fantasy/league", headers=headers)
    me = (await client.get("/fantasy/me", headers=headers)).json()["data"]
    standings = (await client.get("/fantasy/standings", headers=headers)).json()["data"]

    assert response.status_code == 200, response.text
    assert response.json()["data"]["display_name"] == "Bruno"
    assert (await client.get("/auth/me", headers=headers)).json()["data"]["display_name"] == "Bruno"
    assert me["me"]["display_name"] == "Bruno"
    assert [row["display_name"] for row in standings["rows"]] == ["Bruno"]


async def test_the_name_can_be_cleared(client: AsyncClient, login: Login) -> None:
    headers = await login(Role.ASSISTANT_COACH)
    await client.patch("/auth/me", json={"display_name": "Lucas"}, headers=headers)

    response = await client.patch("/auth/me", json={"display_name": None}, headers=headers)

    assert response.json()["data"]["display_name"] is None


async def test_the_name_must_be_short_and_not_blank(client: AsyncClient, login: Login) -> None:
    headers = await login(Role.HEAD_COACH)

    for bad in ("", "   ", "x" * 41):
        response = await client.patch("/auth/me", json={"display_name": bad}, headers=headers)
        assert response.status_code == 422, bad


async def test_a_player_keeps_the_name_of_his_player(
    client: AsyncClient, player_headers: dict[str, str]
) -> None:
    response = await client.patch(
        "/auth/me", json={"display_name": "Otro"}, headers=player_headers
    )

    assert response.status_code == 403
