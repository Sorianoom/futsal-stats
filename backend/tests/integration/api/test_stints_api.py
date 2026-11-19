import uuid
from typing import Any

from httpx import AsyncClient

from app.db.models import Player
from app.domain.roles import Role
from tests.integration.api.conftest import Login, MakePlayer


async def new_match(client: AsyncClient, headers: dict[str, str]) -> str:
    response = await client.post(
        "/matches", json={"held_on": "2026-10-17", "opponent": "Rival FS"}, headers=headers
    )
    return str(response.json()["data"]["id"])


def lineup(seq: int, payload: dict[str, Any]) -> dict[str, Any]:
    return {"id": str(uuid.uuid4()), "seq": seq, "payload": payload}


async def send_lineup(client, headers, match_id, payloads):  # type: ignore[no-untyped-def]
    items = [lineup(seq, payload) for seq, payload in enumerate(payloads, start=1)]
    body = {"events": [], "lineup_events": items, "ratings": []}
    return await client.post(f"/matches/{match_id}/sync", json=body, headers=headers)


def full_match(p: list[Player]) -> list[dict[str, Any]]:
    """p1 juega 0-300 y p6 lo releva; el resto juega las dos partes enteras."""
    ids = [str(x.id) for x in p]
    return [
        {"type": "part_started", "part": 1, "starters": ids[:5]},
        {"type": "substituted", "t": 300, "player_out": ids[0], "player_in": ids[5]},
        {"type": "part_ended", "t": 1200},
        {"type": "part_started", "part": 2, "starters": ids[1:6]},
        {"type": "part_ended", "t": 1200},
    ]


async def prepared_match(client, headers, make_player):  # type: ignore[no-untyped-def]
    match_id = await new_match(client, headers)
    players = [await make_player(n) for n in range(1, 7)]
    await send_lineup(client, headers, match_id, full_match(players))
    return match_id, players


async def test_finalize_builds_the_stints_from_the_lineup_log(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    assistant = await login(Role.ASSISTANT_COACH)
    match_id, players = await prepared_match(client, assistant, make_player)

    response = await client.post(f"/matches/{match_id}/finalize", headers=assistant)

    data = response.json()["data"]
    seconds = data["seconds_by_player"]
    assert response.status_code == 200
    assert seconds[str(players[0].id)] == 300
    assert seconds[str(players[5].id)] == 900 + 1200
    assert all(seconds[str(p.id)] == 2400 for p in players[1:5])
    assert len(data["stints"]) == 5 + 1 + 5  # 5 de la parte 1 + relevo + 5 de la parte 2


async def test_finalized_stints_can_be_listed_by_both_roles(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    head = await login(Role.HEAD_COACH)
    assistant = await login(Role.ASSISTANT_COACH)
    match_id, _ = await prepared_match(client, head, make_player)
    await client.post(f"/matches/{match_id}/finalize", headers=assistant)

    as_head = await client.get(f"/matches/{match_id}/stints", headers=head)
    as_assistant = await client.get(f"/matches/{match_id}/stints", headers=assistant)

    assert as_head.json()["data"] == as_assistant.json()["data"]
    assert len(as_head.json()["data"]) == 11


async def test_finalize_without_lineup_events_is_a_conflict(
    client: AsyncClient, login: Login
) -> None:
    headers = await login()
    match_id = await new_match(client, headers)

    response = await client.post(f"/matches/{match_id}/finalize", headers=headers)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"


async def test_finalize_with_an_unfinished_part_is_a_conflict(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id = await new_match(client, headers)
    players = [await make_player(n) for n in range(1, 6)]
    started = {"type": "part_started", "part": 1, "starters": [str(p.id) for p in players]}
    await send_lineup(client, headers, match_id, [started])

    response = await client.post(f"/matches/{match_id}/finalize", headers=headers)

    assert response.status_code == 409


async def test_finalize_with_an_impossible_log_is_unprocessable(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id = await new_match(client, headers)
    players = [await make_player(n) for n in range(1, 7)]
    ids = [str(p.id) for p in players]
    log = [
        {"type": "part_started", "part": 1, "starters": ids[:5]},
        {"type": "substituted", "t": 100, "player_out": ids[5], "player_in": ids[0]},
    ]
    await send_lineup(client, headers, match_id, log)

    response = await client.post(f"/matches/{match_id}/finalize", headers=headers)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


async def test_finalizing_twice_needs_force_and_only_the_head_coach_can(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    head = await login(Role.HEAD_COACH)
    assistant = await login(Role.ASSISTANT_COACH)
    match_id, _ = await prepared_match(client, assistant, make_player)
    await client.post(f"/matches/{match_id}/finalize", headers=assistant)

    again = await client.post(f"/matches/{match_id}/finalize", headers=head)
    assistant_forced = await client.post(
        f"/matches/{match_id}/finalize", params={"force": "true"}, headers=assistant
    )
    head_forced = await client.post(
        f"/matches/{match_id}/finalize", params={"force": "true"}, headers=head
    )
    listing = await client.get(f"/matches/{match_id}/stints", headers=head)

    assert again.status_code == 409
    assert assistant_forced.status_code == 403
    assert head_forced.status_code == 200
    assert len(listing.json()["data"]) == 11


async def test_head_coach_edits_a_stint(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    head = await login(Role.HEAD_COACH)
    match_id, players = await prepared_match(client, head, make_player)
    await client.post(f"/matches/{match_id}/finalize", headers=head)
    stints = (await client.get(f"/matches/{match_id}/stints", headers=head)).json()["data"]
    first_part_p1 = next(
        s for s in stints if s["player_id"] == str(players[0].id) and s["part"] == 1
    )

    response = await client.patch(
        f"/stints/{first_part_p1['id']}", json={"end_s": 240}, headers=head
    )

    assert response.status_code == 200
    assert response.json()["data"]["end_s"] == 240


async def test_an_edit_that_overlaps_is_rejected_with_the_problem(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    head = await login(Role.HEAD_COACH)
    match_id, players = await prepared_match(client, head, make_player)
    await client.post(f"/matches/{match_id}/finalize", headers=head)

    response = await client.post(
        f"/matches/{match_id}/stints",
        json={"player_id": str(players[0].id), "part": 1, "start_s": 100, "end_s": 400},
        headers=head,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert "solapa" in response.json()["error"]["message"]


async def test_a_sixth_player_on_court_at_once_is_rejected(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    head = await login(Role.HEAD_COACH)
    match_id, players = await prepared_match(client, head, make_player)
    await client.post(f"/matches/{match_id}/finalize", headers=head)

    response = await client.post(
        f"/matches/{match_id}/stints",
        json={"player_id": str(players[0].id), "part": 1, "start_s": 600, "end_s": 700},
        headers=head,
    )

    assert response.status_code == 422
    assert "a la vez" in response.json()["error"]["message"]


async def test_a_new_stint_into_a_free_slot_can_be_added_and_deleted(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    head = await login(Role.HEAD_COACH)
    match_id, players = await prepared_match(client, head, make_player)
    await client.post(f"/matches/{match_id}/finalize", headers=head)
    stints = (await client.get(f"/matches/{match_id}/stints", headers=head)).json()["data"]
    second_part_of_p2 = next(
        s for s in stints if s["player_id"] == str(players[1].id) and s["part"] == 2
    )
    await client.delete(f"/stints/{second_part_of_p2['id']}", headers=head)

    created = await client.post(
        f"/matches/{match_id}/stints",
        json={"player_id": str(players[0].id), "part": 2, "start_s": 0, "end_s": 100},
        headers=head,
    )
    deleted = await client.delete(f"/stints/{created.json()['data']['id']}", headers=head)
    listing = await client.get(f"/matches/{match_id}/stints", headers=head)

    assert created.status_code == 201
    assert deleted.status_code == 200
    assert len(listing.json()["data"]) == 10  # 11 tramos menos el de p2 que se borró


async def test_stint_edits_validate_the_payload_and_the_references(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    head = await login(Role.HEAD_COACH)
    match_id = await new_match(client, head)
    player = await make_player(1)
    base = {"player_id": str(player.id), "part": 1, "start_s": 0, "end_s": 100}

    reversed_times = await client.post(
        f"/matches/{match_id}/stints", json={**base, "start_s": 100, "end_s": 50}, headers=head
    )
    bad_part = await client.post(
        f"/matches/{match_id}/stints", json={**base, "part": 3}, headers=head
    )
    unknown_player = await client.post(
        f"/matches/{match_id}/stints", json={**base, "player_id": str(uuid.uuid4())}, headers=head
    )
    unknown_match = await client.post(f"/matches/{uuid.uuid4()}/stints", json=base, headers=head)
    unknown_stint = await client.patch(f"/stints/{uuid.uuid4()}", json={"end_s": 5}, headers=head)

    assert reversed_times.status_code == 422
    assert bad_part.status_code == 422
    assert unknown_player.status_code == 404
    assert unknown_match.status_code == 404
    assert unknown_stint.status_code == 404


async def test_assistant_coach_cannot_edit_stints(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    head = await login(Role.HEAD_COACH)
    assistant = await login(Role.ASSISTANT_COACH)
    match_id, players = await prepared_match(client, head, make_player)
    await client.post(f"/matches/{match_id}/finalize", headers=head)
    stint_id = (await client.get(f"/matches/{match_id}/stints", headers=head)).json()["data"][0][
        "id"
    ]

    responses = [
        await client.post(
            f"/matches/{match_id}/stints",
            json={"player_id": str(players[0].id), "part": 2, "start_s": 0, "end_s": 5},
            headers=assistant,
        ),
        await client.patch(f"/stints/{stint_id}", json={"end_s": 5}, headers=assistant),
        await client.delete(f"/stints/{stint_id}", headers=assistant),
    ]

    assert [r.status_code for r in responses] == [403, 403, 403]


async def test_finalize_ignores_undone_lineup_movements(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    """Un fin de parte pulsado por error y un cambio con el tiempo mal, deshechos, no cuentan."""
    headers = await login(Role.ASSISTANT_COACH)
    match_id = await new_match(client, headers)
    p = [await make_player(n) for n in range(1, 7)]
    ids = [str(x.id) for x in p]
    started = lineup(1, {"type": "part_started", "part": 1, "starters": ids[:5]})
    early_end = lineup(2, {"type": "part_ended", "t": 0})
    undo_end = lineup(3, {"type": "undo", "voids_event_id": early_end["id"]})
    wrong_sub = lineup(
        4, {"type": "substituted", "t": 900, "player_out": ids[0], "player_in": ids[5]}
    )
    undo_sub = lineup(5, {"type": "undo", "voids_event_id": wrong_sub["id"]})
    rest = [
        lineup(6, {"type": "substituted", "t": 300, "player_out": ids[0], "player_in": ids[5]}),
        lineup(7, {"type": "part_ended", "t": 1200}),
        lineup(8, {"type": "part_started", "part": 2, "starters": ids[1:6]}),
        lineup(9, {"type": "part_ended", "t": 1200}),
    ]
    body = {
        "events": [],
        "lineup_events": [started, early_end, undo_end, wrong_sub, undo_sub, *rest],
        "ratings": [],
    }
    sent = await client.post(f"/matches/{match_id}/sync", json=body, headers=headers)
    assert sent.json()["data"]["rejected"] == []

    response = await client.post(f"/matches/{match_id}/finalize", headers=headers)

    seconds = response.json()["data"]["seconds_by_player"]
    assert response.status_code == 200
    assert seconds[ids[0]] == 300
    assert seconds[ids[5]] == 900 + 1200
