import uuid
from datetime import datetime
from typing import Any

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Match
from app.domain.points.callup import Position
from app.domain.roles import Role
from tests.integration.api.conftest import Login, MakePlayer


async def new_match(client: AsyncClient, headers: dict[str, str]) -> str:
    response = await client.post(
        "/matches", json={"held_on": "2026-10-17", "opponent": "Rival FS"}, headers=headers
    )
    return str(response.json()["data"]["id"])


def event(
    seq: int,
    kind: str = "goal",
    player_id: object = None,
    part: int = 1,
    t: int = 100,
    voids: object = None,
    id_: object = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "id": str(id_ or uuid.uuid4()),
        "seq": seq,
        "kind": kind,
        "part": part,
        "t": t,
        "player_id": str(player_id) if player_id else None,
        "voids_event_id": str(voids) if voids else None,
    }
    return body


async def sync(client, headers, match_id, **streams):  # type: ignore[no-untyped-def]
    body = {"events": [], "lineup_events": [], "ratings": [], **streams}
    return await client.post(f"/matches/{match_id}/sync", json=body, headers=headers)


async def test_assistant_coach_syncs_events_and_they_come_back_in_order(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    head = await login(Role.HEAD_COACH)
    assistant = await login(Role.ASSISTANT_COACH)
    match_id = await new_match(client, head)
    player = await make_player(7)
    second = event(2, "shot", player.id, t=200)
    first = event(1, "goal", player.id, t=100)

    response = await sync(client, assistant, match_id, events=[second, first])
    stored = await client.get(f"/matches/{match_id}/events", headers=assistant)

    data = response.json()["data"]
    assert response.status_code == 200
    assert sorted(data["accepted"]) == sorted([first["id"], second["id"]])
    assert data["duplicates"] == [] and data["rejected"] == []
    assert [e["id"] for e in stored.json()["data"]] == [first["id"], second["id"]]


async def test_resending_the_same_batch_stores_nothing_twice(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id = await new_match(client, headers)
    player = await make_player(7)
    batch = [event(1, "goal", player.id), event(2, "foul", player.id)]
    await sync(client, headers, match_id, events=batch)

    again = await sync(client, headers, match_id, events=batch)
    stored = await client.get(f"/matches/{match_id}/events", headers=headers)

    data = again.json()["data"]
    assert data["accepted"] == [] and data["rejected"] == []
    assert sorted(data["duplicates"]) == sorted(e["id"] for e in batch)
    assert len(stored.json()["data"]) == 2


async def test_a_mixed_batch_separates_new_from_already_stored(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id = await new_match(client, headers)
    player = await make_player(7)
    old, new = event(1, "goal", player.id), event(2, "shot", player.id)
    await sync(client, headers, match_id, events=[old])

    response = await sync(client, headers, match_id, events=[old, new])

    data = response.json()["data"]
    assert (data["accepted"], data["duplicates"]) == ([new["id"]], [old["id"]])


async def test_an_unknown_player_rejects_only_that_item(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id = await new_match(client, headers)
    player = await make_player(7)
    good, bad = event(1, "goal", player.id), event(2, "goal", uuid.uuid4())

    response = await sync(client, headers, match_id, events=[good, bad])

    data = response.json()["data"]
    assert data["accepted"] == [good["id"]]
    assert data["rejected"] == [{"id": bad["id"], "reason": "unknown_player"}]


async def test_a_seq_taken_by_another_event_is_rejected(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id = await new_match(client, headers)
    player = await make_player(7)
    await sync(client, headers, match_id, events=[event(1, "goal", player.id)])
    clash = event(1, "shot", player.id)

    response = await sync(client, headers, match_id, events=[clash])

    assert response.json()["data"]["rejected"] == [{"id": clash["id"], "reason": "seq_conflict"}]


async def test_an_event_id_already_used_in_another_match_is_rejected(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    first_match, second_match = await new_match(client, headers), await new_match(client, headers)
    player = await make_player(7)
    shared = event(1, "goal", player.id)
    await sync(client, headers, first_match, events=[shared])

    response = await sync(client, headers, second_match, events=[shared])

    assert response.json()["data"]["rejected"] == [{"id": shared["id"], "reason": "id_conflict"}]


async def test_undo_voids_an_event_and_bad_undos_are_rejected(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id = await new_match(client, headers)
    player = await make_player(7)
    goal = event(1, "goal", player.id)
    undo = event(2, "undo", voids=goal["id"])
    undo_again = event(3, "undo", voids=goal["id"])
    undo_ghost = event(4, "undo", voids=uuid.uuid4())

    response = await sync(client, headers, match_id, events=[goal, undo, undo_again, undo_ghost])

    data = response.json()["data"]
    assert sorted(data["accepted"]) == sorted([goal["id"], undo["id"]])
    assert {r["id"]: r["reason"] for r in data["rejected"]} == {
        undo_again["id"]: "already_voided",
        undo_ghost["id"]: "void_target_missing",
    }


async def test_lineup_events_and_ratings_are_accepted_and_idempotent(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id = await new_match(client, headers)
    players = [await make_player(n) for n in range(1, 6)]
    lineup = {
        "id": str(uuid.uuid4()),
        "seq": 1,
        "payload": {"type": "part_started", "part": 1, "starters": [str(p.id) for p in players]},
    }
    rating = {"id": str(uuid.uuid4()), "part": 1, "t": 300, "stars": 4}

    first = await sync(client, headers, match_id, lineup_events=[lineup], ratings=[rating])
    again = await sync(client, headers, match_id, lineup_events=[lineup], ratings=[rating])

    assert sorted(first.json()["data"]["accepted"]) == sorted([lineup["id"], rating["id"]])
    assert sorted(again.json()["data"]["duplicates"]) == sorted([lineup["id"], rating["id"]])


async def test_sync_status_tells_the_client_where_to_resume(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id = await new_match(client, headers)
    player = await make_player(7)
    await sync(
        client,
        headers,
        match_id,
        events=[event(5, "goal", player.id), event(9, "shot", player.id)],
        ratings=[{"id": str(uuid.uuid4()), "part": 1, "t": 10, "stars": 5}],
    )

    response = await client.get(f"/matches/{match_id}/sync-status", headers=headers)

    assert response.json()["data"] == {
        "events": {"count": 2, "last_seq": 9},
        "lineup_events": {"count": 0, "last_seq": None},
        "ratings": {"count": 1},
    }


async def test_invalid_items_are_a_validation_error_for_the_whole_request(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id = await new_match(client, headers)
    player = await make_player(7)
    ghost = uuid.uuid4()

    invalid = [
        event(1, "goal", player.id, part=3),
        event(1, "goal", player.id, t=-1),
        event(1, "goal", None),
        event(1, "rival_goal", player.id),
        event(1, "undo", None),
        event(1, "goal", player.id, voids=ghost),
        event(-1, "goal", player.id),
        {**event(1, "goal", player.id), "kind": "dance"},
    ]
    responses = [await sync(client, headers, match_id, events=[bad]) for bad in invalid]

    assert [r.status_code for r in responses] == [422] * len(invalid)


async def test_rival_goals_have_no_player_and_are_accepted(
    client: AsyncClient, login: Login
) -> None:
    headers = await login()
    match_id = await new_match(client, headers)
    rival = event(1, "rival_goal", None)

    response = await sync(client, headers, match_id, events=[rival])

    assert response.json()["data"]["accepted"] == [rival["id"]]


async def test_saves_belong_to_a_goalkeeper_are_stored_and_can_be_undone(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id = await new_match(client, headers)
    goalkeeper = await make_player(1, position=Position.GOALKEEPER)
    save = event(1, "save", goalkeeper.id)
    undo = event(2, "undo", voids=save["id"])

    response = await sync(client, headers, match_id, events=[save, undo])
    stored = await client.get(f"/matches/{match_id}/events", headers=headers)
    without_player = await sync(client, headers, match_id, events=[event(3, "save", None)])

    assert sorted(response.json()["data"]["accepted"]) == sorted([save["id"], undo["id"]])
    assert [(e["kind"], e["player_id"]) for e in stored.json()["data"]] == [
        ("save", str(goalkeeper.id)),
        ("undo", None),
    ]
    assert without_player.status_code == 422


async def test_lineup_payload_and_rating_validation(client: AsyncClient, login: Login) -> None:
    headers = await login()
    match_id = await new_match(client, headers)

    bad_type = await sync(
        client,
        headers,
        match_id,
        lineup_events=[{"id": str(uuid.uuid4()), "seq": 1, "payload": {"type": "dance"}}],
    )
    bad_stars = await sync(
        client,
        headers,
        match_id,
        ratings=[{"id": str(uuid.uuid4()), "part": 1, "t": 1, "stars": 6}],
    )

    assert bad_type.status_code == 422
    assert bad_stars.status_code == 422


async def test_batches_are_capped(client: AsyncClient, login: Login) -> None:
    headers = await login()
    match_id = await new_match(client, headers)

    response = await sync(
        client, headers, match_id, events=[event(n, "rival_goal") for n in range(501)]
    )

    assert response.status_code == 422


async def test_unknown_match_and_missing_credentials(client: AsyncClient, login: Login) -> None:
    headers = await login()

    unknown = await sync(client, headers, uuid.uuid4())
    anonymous = await client.post(f"/matches/{uuid.uuid4()}/sync", json={})
    events = await client.get(f"/matches/{uuid.uuid4()}/events", headers=headers)

    assert unknown.status_code == 404
    assert anonymous.status_code == 401
    assert events.status_code == 404


async def test_lineup_events_come_back_in_order_so_the_client_can_rebuild_the_court(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login(Role.ASSISTANT_COACH)
    match_id = await new_match(client, headers)
    players = [await make_player(n) for n in range(1, 7)]
    starters = [str(p.id) for p in players[:5]]
    started = {
        "id": str(uuid.uuid4()),
        "seq": 1,
        "payload": {"type": "part_started", "part": 1, "starters": starters},
    }
    substitution = {
        "id": str(uuid.uuid4()),
        "seq": 2,
        "payload": {
            "type": "substituted",
            "t": 300,
            "player_out": starters[0],
            "player_in": str(players[5].id),
        },
    }
    await sync(client, headers, match_id, lineup_events=[substitution, started])

    response = await client.get(f"/matches/{match_id}/lineup-events", headers=headers)

    data = response.json()["data"]
    assert response.status_code == 200
    assert [e["id"] for e in data] == [started["id"], substitution["id"]]
    assert [e["seq"] for e in data] == [1, 2]
    assert data[0]["payload"] == {"type": "part_started", "part": 1, "starters": starters}
    assert data[1]["payload"]["player_in"] == str(players[5].id)
    assert response.json()["meta"]["total"] == 2


async def test_lineup_events_of_a_match_without_them_are_an_empty_list(
    client: AsyncClient, login: Login
) -> None:
    headers = await login()
    match_id = await new_match(client, headers)

    response = await client.get(f"/matches/{match_id}/lineup-events", headers=headers)

    assert response.status_code == 200
    assert response.json()["data"] == []


async def test_lineup_events_need_credentials_and_an_existing_match(
    client: AsyncClient, login: Login
) -> None:
    headers = await login()

    unknown = await client.get(f"/matches/{uuid.uuid4()}/lineup-events", headers=headers)
    anonymous = await client.get(f"/matches/{uuid.uuid4()}/lineup-events")

    assert unknown.status_code == 404
    assert anonymous.status_code == 401


def lineup_item(seq: int, payload: dict[str, Any]) -> dict[str, Any]:
    return {"id": str(uuid.uuid4()), "seq": seq, "payload": payload}


async def test_only_the_last_lineup_movement_can_be_undone(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login(Role.ASSISTANT_COACH)
    match_id = await new_match(client, headers)
    players = [str((await make_player(n)).id) for n in range(1, 8)]
    started = lineup_item(1, {"type": "part_started", "part": 1, "starters": players[:5]})
    sub = lineup_item(
        2, {"type": "substituted", "t": 60, "player_out": players[0], "player_in": players[5]}
    )
    await sync(client, headers, match_id, lineup_events=[started, sub])
    undo_old = lineup_item(3, {"type": "undo", "voids_event_id": started["id"]})
    undo_last = lineup_item(4, {"type": "undo", "voids_event_id": sub["id"]})
    undo_again = lineup_item(5, {"type": "undo", "voids_event_id": undo_last["id"]})

    response = await sync(
        client, headers, match_id, lineup_events=[undo_old, undo_last, undo_again]
    )

    data = response.json()["data"]
    assert data["accepted"] == [undo_last["id"]]
    assert {r["id"]: r["reason"] for r in data["rejected"]} == {
        undo_old["id"]: "void_not_last",
        undo_again["id"]: "void_of_undo",
    }
    listed = await client.get(f"/matches/{match_id}/lineup-events", headers=headers)
    assert listed.json()["data"][-1]["payload"] == {
        "type": "undo",
        "voids_event_id": sub["id"],
    }


async def test_a_lineup_undo_needs_what_it_voids(client: AsyncClient, login: Login) -> None:
    headers = await login()
    match_id = await new_match(client, headers)
    bad = lineup_item(1, {"type": "undo"})

    response = await sync(client, headers, match_id, lineup_events=[bad])

    assert response.status_code == 422


async def _started_at(session: AsyncSession, match_id: str) -> datetime | None:
    query = select(Match.started_at).where(Match.id == uuid.UUID(match_id))
    started: datetime | None = (await session.execute(query)).scalar_one()
    return started


async def test_the_first_part_start_marks_when_the_match_started(
    client: AsyncClient, login: Login, make_player: MakePlayer, session: AsyncSession
) -> None:
    headers = await login()
    match_id = await new_match(client, headers)
    starters = [str((await make_player(n)).id) for n in range(1, 6)]

    def start(seq: int, part: int) -> dict[str, Any]:
        payload = {"type": "part_started", "part": part, "starters": starters}
        return {"id": str(uuid.uuid4()), "seq": seq, "payload": payload}

    await sync(client, headers, match_id, events=[event(1, "shot", starters[0])])
    before = await _started_at(session, match_id)
    await sync(client, headers, match_id, lineup_events=[start(1, 1)])
    started = await _started_at(session, match_id)
    await sync(client, headers, match_id, lineup_events=[start(2, 2)])

    assert before is None
    assert started is not None
    assert await _started_at(session, match_id) == started  # la 2ª parte no la mueve


# --- Detalle del gol ---------------------------------------------------------------------------


async def test_a_goal_syncs_with_its_types_and_point_and_comes_back(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    head = await login(Role.HEAD_COACH)
    match_id = await new_match(client, head)
    player = await make_player(7)
    against = {
        **event(1, "rival_goal"),
        "goal_tags": ["set_piece", "far_post"],
        "goal_x": 80,
        "goal_y": 12,
    }
    ours = event(2, "goal", player.id)

    response = await sync(client, head, match_id, events=[against, ours])
    stored = (await client.get(f"/matches/{match_id}/events", headers=head)).json()["data"]

    assert response.status_code == 200 and response.json()["data"]["rejected"] == []
    assert stored[0]["goal_tags"] == ["set_piece", "far_post"]
    assert (stored[0]["goal_x"], stored[0]["goal_y"]) == (80, 12)
    assert stored[1]["goal_tags"] is None and stored[1]["goal_x"] is None


async def test_only_goals_carry_a_detail_and_it_must_be_possible(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    head = await login(Role.HEAD_COACH)
    match_id = await new_match(client, head)
    player = await make_player(7)

    foul = await sync(
        client, head, match_id, events=[{**event(1, "foul", player.id), "goal_tags": ["counter"]}]
    )
    half_point = await sync(
        client, head, match_id, events=[{**event(1, "rival_goal"), "goal_x": 5}]
    )
    unknown = await sync(
        client, head, match_id, events=[{**event(1, "rival_goal"), "goal_tags": ["chilena"]}]
    )

    assert foul.status_code == half_point.status_code == unknown.status_code == 422


async def test_the_detail_of_a_goal_can_be_completed_later(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    head = await login(Role.HEAD_COACH)
    match_id = await new_match(client, head)
    player = await make_player(7)
    goal, foul = event(1, "rival_goal"), event(2, "foul", player.id)
    await sync(client, head, match_id, events=[goal, foul])
    url = f"/matches/{match_id}/events/{{}}/goal-detail"
    body = {"goal_tags": ["turnover", "one_on_one"], "goal_x": 40, "goal_y": 30}

    response = await client.put(url.format(goal["id"]), json=body, headers=head)
    again = await sync(client, head, match_id, events=[goal])
    stored = (await client.get(f"/matches/{match_id}/events", headers=head)).json()["data"][0]
    cleared = await client.put(url.format(goal["id"]), json={}, headers=head)
    not_a_goal = await client.put(url.format(foul["id"]), json=body, headers=head)
    missing = await client.put(url.format(uuid.uuid4()), json=body, headers=head)

    assert response.status_code == 200
    assert response.json()["data"]["goal_tags"] == ["turnover", "one_on_one"]
    assert again.json()["data"]["duplicates"] == [goal["id"]]
    assert (stored["goal_tags"], stored["goal_x"], stored["goal_y"]) == (
        ["turnover", "one_on_one"],
        40,
        30,
    )
    assert cleared.json()["data"]["goal_tags"] is None and cleared.json()["data"]["goal_x"] is None
    assert not_a_goal.status_code == 422 and not_a_goal.json()["error"]["code"] == "not_a_goal"
    assert missing.status_code == 404


async def test_a_player_cannot_change_the_detail_of_a_goal(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    head = await login(Role.HEAD_COACH)
    match_id = await new_match(client, head)
    goal = event(1, "rival_goal")
    await sync(client, head, match_id, events=[goal])
    ficha = await make_player(9)
    player = await login(Role.PLAYER, player_id=ficha.id)

    response = await client.put(
        f"/matches/{match_id}/events/{goal['id']}/goal-detail", json={}, headers=player
    )

    assert response.status_code == 403
