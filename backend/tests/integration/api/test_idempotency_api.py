"""Idempotencia de las altas con efectos en puntos y calendario (cabecera Idempotency-Key)."""

import uuid

from httpx import AsyncClient

from app.domain.roles import Role
from tests.integration.api.conftest import Login, MakePlayer

DAY = "2026-10-14"
MONDAY = "2026-10-12"
KEY = "4f0c1f2e-8a5e-4c55-9d1a-0b6f7c9e2a11"
OTHER_KEY = "9b2d6a40-3c1e-4f7a-8e55-1d2c3b4a5f66"


def keyed(headers: dict[str, str], key: str = KEY) -> dict[str, str]:
    return {**headers, "Idempotency-Key": key}


async def movements(client: AsyncClient, headers: dict[str, str]) -> list[dict[str, object]]:
    response = await client.get("/movements", params={"week": MONDAY}, headers=headers)
    return list(response.json()["data"])


def infraction(player_id: object, code: str = "L-b") -> dict[str, str]:
    return {"player_id": str(player_id), "infraction_code": code, "occurred_on": DAY}


async def test_replaying_an_infraction_with_the_same_key_registers_it_once(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    player = await make_player(1)
    body = infraction(player.id)

    first = await client.post("/movements/infractions", json=body, headers=keyed(headers))
    again = await client.post("/movements/infractions", json=body, headers=keyed(headers))

    assert (first.status_code, again.status_code) == (201, 201)
    assert again.json()["data"] == first.json()["data"]
    assert len(await movements(client, headers)) == 1


async def test_different_keys_are_different_intentions(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    player = await make_player(1)
    body = infraction(player.id)

    await client.post("/movements/infractions", json=body, headers=keyed(headers, KEY))
    await client.post("/movements/infractions", json=body, headers=keyed(headers, OTHER_KEY))

    assert len(await movements(client, headers)) == 2


async def test_without_a_key_nothing_changes(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    player = await make_player(1)
    body = infraction(player.id)

    await client.post("/movements/infractions", json=body, headers=headers)
    await client.post("/movements/infractions", json=body, headers=headers)

    assert len(await movements(client, headers)) == 2


async def test_a_key_reused_with_another_body_is_rejected_and_creates_nothing(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    player = await make_player(1)
    await client.post(
        "/movements/infractions", json=infraction(player.id, "L-b"), headers=keyed(headers)
    )

    reused = await client.post(
        "/movements/infractions", json=infraction(player.id, "L-a"), headers=keyed(headers)
    )

    assert reused.status_code == 422
    assert reused.json()["error"]["code"] == "idempotency_key_reused"
    assert len(await movements(client, headers)) == 1


async def test_a_key_reused_on_another_endpoint_is_rejected(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    player = await make_player(1)
    await client.post("/movements/infractions", json=infraction(player.id), headers=keyed(headers))

    reused = await client.post(
        "/sessions", json={"kind": "training", "held_on": DAY}, headers=keyed(headers)
    )

    assert reused.status_code == 422
    assert reused.json()["error"]["code"] == "idempotency_key_reused"


async def test_a_key_of_another_user_is_not_replayed(client: AsyncClient, login: Login) -> None:
    head = await login(Role.HEAD_COACH)
    assistant = await login(Role.ASSISTANT_COACH)
    body = {"held_on": DAY, "opponent": "Rival FS"}
    await client.post("/matches", json=body, headers=keyed(head))

    other = await client.post("/matches", json=body, headers=keyed(assistant))

    assert other.status_code == 422
    assert other.json()["error"]["code"] == "idempotency_key_reused"


async def test_replaying_the_wins_awards_the_points_once(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    session_id = (
        await client.post("/sessions", json={"kind": "training", "held_on": DAY}, headers=headers)
    ).json()["data"]["id"]
    first, second = await make_player(1), await make_player(2)
    body = {"kind": "scrimmage", "player_ids": [str(first.id), str(second.id)]}

    one = await client.post(f"/sessions/{session_id}/wins", json=body, headers=keyed(headers))
    again = await client.post(f"/sessions/{session_id}/wins", json=body, headers=keyed(headers))

    assert (one.status_code, again.status_code) == (201, 201)
    assert again.json()["data"] == one.json()["data"]
    assert len(await movements(client, headers)) == 2


async def test_replaying_a_session_creation_creates_one_session(
    client: AsyncClient, login: Login
) -> None:
    headers = await login()
    body = {"kind": "training", "held_on": DAY, "notes": "Táctica"}

    first = await client.post("/sessions", json=body, headers=keyed(headers))
    again = await client.post("/sessions", json=body, headers=keyed(headers))

    assert again.json()["data"] == first.json()["data"]
    listed = await client.get("/sessions", params={"week": MONDAY}, headers=headers)
    assert len(listed.json()["data"]) == 1


async def test_replaying_a_match_creation_creates_one_match(
    client: AsyncClient, login: Login
) -> None:
    headers = await login()
    body = {"held_on": DAY, "opponent": "Rival FS"}

    first = await client.post("/matches", json=body, headers=keyed(headers))
    again = await client.post("/matches", json=body, headers=keyed(headers))

    assert (first.status_code, again.status_code) == (201, 201)
    assert again.json()["data"] == first.json()["data"]
    listed = await client.get("/matches", headers=headers)
    assert len(listed.json()["data"]) == 1


async def test_a_key_that_is_not_a_uuid_is_rejected(client: AsyncClient, login: Login) -> None:
    headers = await login()

    response = await client.post(
        "/sessions",
        json={"kind": "training", "held_on": DAY},
        headers=keyed(headers, "no-es-un-uuid"),
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_idempotency_key"


async def test_a_failed_request_does_not_consume_the_key(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    player = await make_player(1)
    failed = await client.post(
        "/movements/infractions", json=infraction(uuid.uuid4()), headers=keyed(headers)
    )

    retried = await client.post(
        "/movements/infractions", json=infraction(player.id), headers=keyed(headers)
    )

    assert failed.status_code == 404
    assert retried.status_code == 201
    assert len(await movements(client, headers)) == 1
