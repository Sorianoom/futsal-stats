import uuid

from httpx import AsyncClient

from app.domain.points.callup import PlayerStatus, Position
from app.domain.roles import Role
from tests.integration.api.conftest import Login, MakePlayer

MONDAY = "2026-10-12"
DAY = "2026-10-14"


async def give_points(client, headers, session_id, kind, players):  # type: ignore[no-untyped-def]
    ids = [str(p.id) for p in players]
    return await client.post(
        f"/sessions/{session_id}/wins", json={"kind": kind, "player_ids": ids}, headers=headers
    )


async def new_training(client: AsyncClient, headers: dict[str, str]) -> str:
    response = await client.post(
        "/sessions", json={"kind": "training", "held_on": DAY}, headers=headers
    )
    return str(response.json()["data"]["id"])


async def new_match(client: AsyncClient, headers: dict[str, str]) -> str:
    response = await client.post(
        "/matches", json={"held_on": "2026-10-17", "opponent": "Rival FS"}, headers=headers
    )
    return str(response.json()["data"]["id"])


async def test_callup_ranks_by_points_and_flags_what_the_coach_must_decide(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    squad = [await make_player(n) for n in range(1, 13)]
    keepers = [await make_player(n, Position.GOALKEEPER) for n in (21, 22, 23)]
    training = await new_training(client, headers)
    for index, player in enumerate(squad[:6]):
        for _ in range(index + 1):  # puntos distintos: 1 victoria, 2, ... 6
            await give_points(client, headers, training, "exercise", [player])
    await give_points(client, headers, training, "goalkeeper", [keepers[2]])

    response = await client.get("/callup", params={"week": MONDAY}, headers=headers)

    data = response.json()["data"]
    assert response.status_code == 200
    assert data["field"]["guaranteed"] == [str(p.id) for p in reversed(squad[:6])]
    assert len(data["field"]["tied"]) == 6  # los 6 de 20 puntos se disputan 4 plazas
    assert data["field"]["open_slots"] == 4
    assert data["goalkeepers"]["guaranteed"] == [str(keepers[2].id)]
    assert sorted(data["goalkeepers"]["tied"]) == sorted(str(k.id) for k in keepers[:2])
    assert data["goalkeepers"]["open_slots"] == 1
    assert data["starters"]["guaranteed"] == [str(p.id) for p in reversed(squad[2:6])]


async def test_callup_flags_a_tie_at_the_cut_for_the_coach(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    for number in range(1, 13):  # 12 jugadores con 20 puntos: empate en el corte de 10
        await make_player(number)

    response = await client.get("/callup", params={"week": MONDAY}, headers=headers)

    field = response.json()["data"]["field"]
    assert field["guaranteed"] == []
    assert len(field["tied"]) == 12
    assert field["open_slots"] == 10


async def test_callup_shows_points_breakdown_and_player_info(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    player = await make_player(7, name="Pedro Gómez")
    training = await new_training(client, headers)
    await give_points(client, headers, training, "scrimmage", [player])

    data = (await client.get("/callup", params={"week": MONDAY}, headers=headers)).json()["data"]

    row = data["ranking"][0]
    assert (row["name"], row["dorsal"], row["points"]) == ("Pedro Gómez", 7, 25)
    breakdown = data["breakdowns"][str(player.id)]
    assert (breakdown["base"], breakdown["total"]) == (20, 25)
    assert [m["points"] for m in breakdown["items"]] == [5]


async def test_injured_and_inactive_players_do_not_appear(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    healthy = await make_player(1)
    await make_player(2, status=PlayerStatus.INJURED)
    retired = await make_player(3)
    await client.delete(f"/players/{retired.id}", headers=headers)

    data = (await client.get("/callup", params={"week": MONDAY}, headers=headers)).json()["data"]

    assert [r["player_id"] for r in data["ranking"]] == [str(healthy.id)]


async def test_sanctioned_player_is_flagged_and_not_called_up(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    sanctioned, other = await make_player(1), await make_player(2)
    match_id = await new_match(client, headers)
    await client.post(
        "/exclusions",
        json={"player_id": str(sanctioned.id), "match_id": match_id, "kind": "no_callup"},
        headers=headers,
    )

    data = (
        await client.get("/callup", params={"week": MONDAY, "match_id": match_id}, headers=headers)
    ).json()["data"]

    flagged = {r["player_id"]: r["excluded"] for r in data["ranking"]}
    assert flagged == {str(sanctioned.id): "no_callup", str(other.id): None}
    assert str(sanctioned.id) not in data["field"]["guaranteed"] + data["field"]["tied"]


async def test_callup_requires_a_monday_and_the_head_coach(
    client: AsyncClient, login: Login
) -> None:
    head = await login(Role.HEAD_COACH)
    assistant = await login(Role.ASSISTANT_COACH)

    not_monday = await client.get("/callup", params={"week": DAY}, headers=head)
    forbidden = await client.get("/callup", params={"week": MONDAY}, headers=assistant)
    missing_week = await client.get("/callup", headers=head)
    unknown_match = await client.get(
        "/callup", params={"week": MONDAY, "match_id": str(uuid.uuid4())}, headers=head
    )

    assert not_monday.status_code == 422
    assert forbidden.status_code == 403
    assert missing_week.status_code == 422
    assert unknown_match.status_code == 404


async def test_matches_create_their_session_and_are_listed(
    client: AsyncClient, login: Login
) -> None:
    headers = await login()

    created = await client.post(
        "/matches", json={"held_on": "2026-10-17", "opponent": "Rival FS"}, headers=headers
    )
    listing = await client.get("/matches", headers=headers)

    assert created.status_code == 201
    assert created.json()["data"]["opponent"] == "Rival FS"
    assert [m["id"] for m in listing.json()["data"]] == [created.json()["data"]["id"]]
    sessions = await client.get("/sessions", params={"week": "2026-10-12"}, headers=headers)
    assert [s["kind"] for s in sessions.json()["data"]] == ["match"]


async def test_exclusions_are_created_listed_and_removed(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    player = await make_player(1)
    match_id = await new_match(client, headers)
    body = {"player_id": str(player.id), "match_id": match_id, "kind": "no_play"}

    created = await client.post("/exclusions", json=body, headers=headers)
    duplicate = await client.post("/exclusions", json=body, headers=headers)
    listing = await client.get("/exclusions", params={"match_id": match_id}, headers=headers)
    deleted = await client.delete(f"/exclusions/{created.json()['data']['id']}", headers=headers)
    after = await client.get("/exclusions", params={"match_id": match_id}, headers=headers)

    assert created.status_code == 201
    assert duplicate.status_code == 409
    assert len(listing.json()["data"]) == 1
    assert deleted.status_code == 200
    assert after.json()["data"] == []


async def test_exclusions_reject_unknown_player_or_match(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    player = await make_player(1)
    match_id = await new_match(client, headers)

    bad_player = await client.post(
        "/exclusions",
        json={"player_id": str(uuid.uuid4()), "match_id": match_id, "kind": "no_play"},
        headers=headers,
    )
    bad_match = await client.post(
        "/exclusions",
        json={"player_id": str(player.id), "match_id": str(uuid.uuid4()), "kind": "no_play"},
        headers=headers,
    )

    assert bad_player.status_code == 404
    assert bad_match.status_code == 404
