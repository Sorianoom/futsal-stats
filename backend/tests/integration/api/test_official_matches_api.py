"""Partidos oficiales: solo ellos son jornadas del Fantasy."""

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.roles import Role
from tests.integration.api.conftest import Login, MakePlayer
from tests.integration.api.fantasy_support import Clock, fantasy_client
from tests.integration.api.test_stats_api import played_match

# «Hoy» para las pruebas: dos días antes del partido de `_create`.
TODAY = datetime(2026, 10, 15, 10, 0, tzinfo=UTC)


@pytest.fixture
async def client(session: AsyncSession) -> AsyncIterator[AsyncClient]:
    async for http in fantasy_client(session, Clock(TODAY)):
        yield http


async def _create(client: AsyncClient, headers: dict[str, str], **extra: Any) -> dict[str, Any]:
    body = {"held_on": "2026-10-17", "opponent": "Rival FS", **extra}
    response = await client.post("/matches", json=body, headers=headers)
    assert response.status_code == 201, response.text
    data: dict[str, Any] = response.json()["data"]
    return data


async def test_a_new_match_is_official_by_default(client: AsyncClient, login: Login) -> None:
    headers = await login()

    match = await _create(client, headers)

    assert match["is_official"] is True
    listed = (await client.get("/matches", headers=headers)).json()["data"]
    assert listed[0]["is_official"] is True


async def test_a_match_can_be_created_as_a_friendly(client: AsyncClient, login: Login) -> None:
    headers = await login()

    match = await _create(client, headers, is_official=False)

    assert match["is_official"] is False


async def test_staff_can_mark_a_match_as_friendly_and_back(
    client: AsyncClient, login: Login
) -> None:
    headers = await login(Role.ASSISTANT_COACH)
    match = await _create(client, headers)

    friendly = await client.patch(
        f"/matches/{match['id']}", json={"is_official": False}, headers=headers
    )
    official = await client.patch(
        f"/matches/{match['id']}", json={"is_official": True}, headers=headers
    )

    assert friendly.status_code == 200
    assert friendly.json()["data"]["is_official"] is False
    assert friendly.json()["data"]["held_on"] == "2026-10-17"
    assert official.json()["data"]["is_official"] is True


async def test_patching_an_unknown_match_is_404(client: AsyncClient, login: Login) -> None:
    headers = await login()

    response = await client.patch(
        f"/matches/{uuid.uuid4()}", json={"is_official": False}, headers=headers
    )

    assert response.status_code == 404


async def test_patch_requires_the_flag(client: AsyncClient, login: Login) -> None:
    headers = await login()
    match = await _create(client, headers)

    response = await client.patch(f"/matches/{match['id']}", json={}, headers=headers)

    assert response.status_code == 422


# --- Cambiar el día de un partido programado ---


async def test_staff_can_move_a_scheduled_match_to_another_day(
    client: AsyncClient, login: Login
) -> None:
    headers = await login(Role.ASSISTANT_COACH)
    match = await _create(client, headers)

    response = await client.patch(
        f"/matches/{match['id']}", json={"held_on": "2026-10-24"}, headers=headers
    )

    assert response.status_code == 200, response.text
    assert response.json()["data"]["held_on"] == "2026-10-24"
    assert response.json()["data"]["is_official"] is True
    listed = (await client.get("/matches", headers=headers)).json()["data"]
    assert listed[0]["held_on"] == "2026-10-24"


async def test_a_match_can_be_moved_to_today_but_not_to_the_past(
    client: AsyncClient, login: Login
) -> None:
    headers = await login()
    match = await _create(client, headers)

    today = await client.patch(
        f"/matches/{match['id']}", json={"held_on": "2026-10-15"}, headers=headers
    )
    past = await client.patch(
        f"/matches/{match['id']}", json={"held_on": "2026-10-14"}, headers=headers
    )

    assert today.status_code == 200
    assert past.status_code == 422
    assert past.json()["error"]["code"] == "date_in_past"


async def test_a_started_match_cannot_change_day(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id, _ = await played_match(client, headers, make_player, finalize=False)

    response = await client.patch(
        f"/matches/{match_id}", json={"held_on": "2026-10-30"}, headers=headers
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "match_started"


async def test_keeping_the_same_day_is_allowed_even_after_starting(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id, _ = await played_match(client, headers, make_player, finalize=False)
    held_on = next(
        m["held_on"]
        for m in (await client.get("/matches", headers=headers)).json()["data"]
        if m["id"] == match_id
    )

    response = await client.patch(
        f"/matches/{match_id}", json={"held_on": held_on, "is_official": False}, headers=headers
    )

    assert response.status_code == 200
    assert response.json()["data"]["is_official"] is False


async def test_players_cannot_change_the_day(
    client: AsyncClient, login: Login, player_headers: dict[str, str]
) -> None:
    coach = await login()
    match = await _create(client, coach)
    player = player_headers

    response = await client.patch(
        f"/matches/{match['id']}", json={"held_on": "2026-10-24"}, headers=player
    )

    assert response.status_code == 403
