import uuid

from httpx import AsyncClient

from app.domain.roles import Role
from tests.integration.api.conftest import Login, MakePlayer

DAY = "2026-10-14"
MONDAY = "2026-10-12"
NEXT_MONDAY = "2026-10-19"


async def register(client, headers, player_id, code, **extra):  # type: ignore[no-untyped-def]
    body = {"player_id": str(player_id), "infraction_code": code, "occurred_on": DAY, **extra}
    return await client.post("/movements/infractions", json=body, headers=headers)


async def test_registering_an_infraction_creates_a_negative_movement(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    player = await make_player(1)

    response = await register(client, headers, player.id, "L-b", reason="Tono con un compañero")

    movement = response.json()["data"]["movement"]
    assert response.status_code == 201
    assert (movement["points"], movement["applies_week"]) == (-3, MONDAY)
    assert movement["infraction_code"] == "L-b"
    assert movement["reason"] == "Tono con un compañero"
    assert response.json()["data"]["escalations"] == []


async def test_deferred_infraction_applies_to_the_next_week(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    player = await make_player(1)

    response = await register(client, headers, player.id, "MG-c")

    data = response.json()["data"]
    assert data["movement"]["applies_week"] == NEXT_MONDAY
    assert data["sanction"] == {"kind": "no_play", "min_matches": 1, "max_matches": 1}


async def test_back_talk_defers_only_when_in_a_match(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    player = await make_player(1)

    in_training = await register(client, headers, player.id, "MG-i")
    in_match = await register(client, headers, player.id, "MG-i", in_match=True)

    assert in_training.json()["data"]["movement"]["applies_week"] == MONDAY
    assert in_match.json()["data"]["movement"]["applies_week"] == NEXT_MONDAY


async def test_the_fourth_light_fault_proposes_but_does_not_create_the_serious_one(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    player = await make_player(1)
    for code in ("L-b", "L-c", "L-d"):
        await register(client, headers, player.id, code)

    fourth = await register(client, headers, player.id, "L-b")
    listing = await client.get("/movements", params={"week": MONDAY}, headers=headers)

    escalations = fourth.json()["data"]["escalations"]
    assert [e["infraction_code"] for e in escalations] == ["G-h"]
    assert len(listing.json()["data"]) == 4


async def test_confirming_the_proposed_serious_fault_clears_the_proposal(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    player = await make_player(1)
    for code in ("L-b", "L-c", "L-d", "L-b"):
        await register(client, headers, player.id, code)

    confirmed = await register(client, headers, player.id, "G-h")

    assert confirmed.json()["data"]["escalations"] == []


async def test_unknown_infraction_or_player_is_not_found(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    player = await make_player(1)

    bad_code = await register(client, headers, player.id, "ZZ-9")
    bad_player = await register(client, headers, uuid.uuid4(), "L-a")

    assert bad_code.status_code == 404
    assert bad_player.status_code == 404


async def test_movements_can_be_filtered_by_week_and_player(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    first, second = await make_player(1), await make_player(2)
    await register(client, headers, first.id, "L-a")
    await register(client, headers, second.id, "L-a")
    await register(client, headers, first.id, "MG-c")

    this_week = await client.get("/movements", params={"week": MONDAY}, headers=headers)
    next_week = await client.get("/movements", params={"week": NEXT_MONDAY}, headers=headers)
    only_first = await client.get(
        "/movements", params={"week": MONDAY, "player_id": str(first.id)}, headers=headers
    )

    assert len(this_week.json()["data"]) == 2
    assert [m["infraction_code"] for m in next_week.json()["data"]] == ["MG-c"]
    assert [m["player_id"] for m in only_first.json()["data"]] == [str(first.id)]


async def test_a_movement_can_be_deleted_to_correct_a_mistake(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    player = await make_player(1)
    movement_id = (await register(client, headers, player.id, "L-a")).json()["data"]["movement"][
        "id"
    ]

    deleted = await client.delete(f"/movements/{movement_id}", headers=headers)
    again = await client.delete(f"/movements/{movement_id}", headers=headers)
    listing = await client.get("/movements", params={"week": MONDAY}, headers=headers)

    assert deleted.status_code == 200
    assert again.status_code == 404
    assert listing.json()["data"] == []


async def test_assistant_coach_cannot_touch_movements_or_the_catalog(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    assistant = await login(Role.ASSISTANT_COACH)
    player = await make_player(1)

    responses = [
        await register(client, assistant, player.id, "L-a"),
        await client.get("/movements", params={"week": MONDAY}, headers=assistant),
        await client.delete(f"/movements/{uuid.uuid4()}", headers=assistant),
        await client.get("/catalog/infractions", headers=assistant),
    ]

    assert [r.status_code for r in responses] == [403, 403, 403, 403]


async def test_catalog_lists_every_infraction_with_its_points(
    client: AsyncClient, login: Login, seeded_catalog: None
) -> None:
    headers = await login()

    response = await client.get("/catalog/infractions", headers=headers)

    by_code = {i["code"]: i for i in response.json()["data"]}
    assert len(by_code) == 32
    assert by_code["L-a"]["points"] == -3
    assert by_code["MG-c"]["deferral"] == "next_week"
