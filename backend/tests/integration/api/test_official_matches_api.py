"""Partidos oficiales: solo ellos son jornadas del Fantasy."""

import uuid
from typing import Any

from httpx import AsyncClient

from app.domain.roles import Role
from tests.integration.api.conftest import Login


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
