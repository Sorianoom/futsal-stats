import uuid

from httpx import AsyncClient

from app.domain.roles import Role
from tests.integration.api.conftest import Login

NEW_PLAYER = {"name": "Pedro Gómez", "dorsal": 7, "position": "field"}


async def create(client: AsyncClient, headers: dict[str, str], **overrides: object):  # type: ignore[no-untyped-def]
    return await client.post("/players", json={**NEW_PLAYER, **overrides}, headers=headers)


async def test_listing_requires_authentication(client: AsyncClient) -> None:
    response = await client.get("/players")

    assert response.status_code == 401


async def test_head_coach_creates_a_player(client: AsyncClient, login: Login) -> None:
    headers = await login(Role.HEAD_COACH)

    response = await create(client, headers)

    data = response.json()["data"]
    assert response.status_code == 201
    assert (data["name"], data["dorsal"], data["position"]) == ("Pedro Gómez", 7, "field")
    assert data["status"] == "available"
    assert data["is_active"] is True


async def test_a_player_has_no_alias_unless_given(client: AsyncClient, login: Login) -> None:
    headers = await login(Role.HEAD_COACH)

    response = await create(client, headers)

    assert response.json()["data"]["alias"] is None


async def test_a_player_can_be_created_with_an_alias(client: AsyncClient, login: Login) -> None:
    headers = await login(Role.HEAD_COACH)

    created = await create(client, headers, alias="Pedri")
    listing = await client.get("/players", headers=headers)

    assert created.json()["data"]["alias"] == "Pedri"
    assert listing.json()["data"][0]["alias"] == "Pedri"


async def test_the_alias_can_be_changed_and_removed(client: AsyncClient, login: Login) -> None:
    headers = await login(Role.HEAD_COACH)
    player_id = (await create(client, headers, alias="Pedri")).json()["data"]["id"]

    changed = await client.patch(f"/players/{player_id}", json={"alias": "Pedro"}, headers=headers)
    removed = await client.patch(f"/players/{player_id}", json={"alias": None}, headers=headers)

    assert changed.json()["data"]["alias"] == "Pedro"
    assert removed.json()["data"]["alias"] is None
    assert removed.json()["data"]["name"] == "Pedro Gómez"


async def test_updating_other_fields_keeps_the_alias(client: AsyncClient, login: Login) -> None:
    headers = await login(Role.HEAD_COACH)
    player_id = (await create(client, headers, alias="Pedri")).json()["data"]["id"]

    response = await client.patch(f"/players/{player_id}", json={"dorsal": 9}, headers=headers)

    assert response.json()["data"]["alias"] == "Pedri"


async def test_an_alias_cannot_be_blank_or_too_long(client: AsyncClient, login: Login) -> None:
    headers = await login(Role.HEAD_COACH)

    blank = await create(client, headers, alias="   ")
    too_long = await create(client, headers, alias="x" * 31)

    assert (blank.status_code, too_long.status_code) == (422, 422)


async def test_assistant_coach_cannot_create_update_or_delete(
    client: AsyncClient, login: Login
) -> None:
    head = await login(Role.HEAD_COACH)
    assistant = await login(Role.ASSISTANT_COACH)
    player_id = (await create(client, head)).json()["data"]["id"]

    created = await create(client, assistant, dorsal=8)
    updated = await client.patch(f"/players/{player_id}", json={"name": "X"}, headers=assistant)
    deleted = await client.delete(f"/players/{player_id}", headers=assistant)

    assert (created.status_code, updated.status_code, deleted.status_code) == (403, 403, 403)
    assert created.json()["error"]["code"] == "forbidden"


async def test_both_roles_can_list_and_read(client: AsyncClient, login: Login) -> None:
    head = await login(Role.HEAD_COACH)
    assistant = await login(Role.ASSISTANT_COACH)
    player_id = (await create(client, head)).json()["data"]["id"]

    listing = await client.get("/players", headers=assistant)
    single = await client.get(f"/players/{player_id}", headers=assistant)

    assert listing.status_code == single.status_code == 200
    assert listing.json()["meta"]["total"] == 1
    assert single.json()["data"]["id"] == player_id


async def test_list_is_ordered_by_dorsal(client: AsyncClient, login: Login) -> None:
    headers = await login()
    await create(client, headers, dorsal=10, name="B")
    await create(client, headers, dorsal=3, name="A")

    response = await client.get("/players", headers=headers)

    assert [p["dorsal"] for p in response.json()["data"]] == [3, 10]


async def test_duplicate_dorsal_is_a_conflict(client: AsyncClient, login: Login) -> None:
    headers = await login()
    await create(client, headers)

    response = await create(client, headers, name="Otro")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"


async def test_invalid_payloads_are_rejected(client: AsyncClient, login: Login) -> None:
    headers = await login()

    bad = [
        await create(client, headers, name=""),
        await create(client, headers, dorsal=-1),
        await create(client, headers, dorsal=100),
        await create(client, headers, position="winger"),
        await create(client, headers, name="x" * 101),
    ]

    assert all(r.status_code == 422 for r in bad)
    assert all(r.json()["error"]["code"] == "validation_error" for r in bad)


async def test_update_changes_status_and_position(client: AsyncClient, login: Login) -> None:
    headers = await login()
    player_id = (await create(client, headers)).json()["data"]["id"]

    response = await client.patch(
        f"/players/{player_id}",
        json={"status": "injured", "position": "goalkeeper"},
        headers=headers,
    )

    data = response.json()["data"]
    assert (data["status"], data["position"], data["name"]) == (
        "injured",
        "goalkeeper",
        "Pedro Gómez",
    )


async def test_update_to_an_existing_dorsal_is_a_conflict(
    client: AsyncClient, login: Login
) -> None:
    headers = await login()
    await create(client, headers, dorsal=7)
    other_id = (await create(client, headers, dorsal=8, name="Luis")).json()["data"]["id"]

    response = await client.patch(f"/players/{other_id}", json={"dorsal": 7}, headers=headers)

    assert response.status_code == 409


async def test_update_rejects_unknown_fields(client: AsyncClient, login: Login) -> None:
    headers = await login()
    player_id = (await create(client, headers)).json()["data"]["id"]

    response = await client.patch(
        f"/players/{player_id}", json={"id": str(uuid.uuid4())}, headers=headers
    )

    assert response.status_code == 422


async def test_delete_deactivates_instead_of_removing(client: AsyncClient, login: Login) -> None:
    headers = await login()
    player_id = (await create(client, headers)).json()["data"]["id"]

    deleted = await client.delete(f"/players/{player_id}", headers=headers)
    listing = await client.get("/players", headers=headers)
    single = await client.get(f"/players/{player_id}", headers=headers)

    assert deleted.status_code == 200
    assert deleted.json()["data"]["is_active"] is False
    assert listing.json()["data"] == []
    assert single.json()["data"]["is_active"] is False


async def test_inactive_players_can_be_listed_on_request(client: AsyncClient, login: Login) -> None:
    headers = await login()
    player_id = (await create(client, headers)).json()["data"]["id"]
    await client.delete(f"/players/{player_id}", headers=headers)

    response = await client.get("/players", params={"include_inactive": "true"}, headers=headers)

    assert len(response.json()["data"]) == 1


async def test_unknown_player_is_not_found(client: AsyncClient, login: Login) -> None:
    headers = await login()
    missing = uuid.uuid4()

    responses = [
        await client.get(f"/players/{missing}", headers=headers),
        await client.patch(f"/players/{missing}", json={"name": "X"}, headers=headers),
        await client.delete(f"/players/{missing}", headers=headers),
    ]

    assert all(r.status_code == 404 for r in responses)
    assert all(r.json()["error"]["code"] == "not_found" for r in responses)


async def test_malformed_id_is_a_validation_error(client: AsyncClient, login: Login) -> None:
    headers = await login()

    response = await client.get("/players/not-a-uuid", headers=headers)

    assert response.status_code == 422
