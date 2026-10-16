import uuid

from httpx import AsyncClient

from app.domain.roles import Role
from tests.integration.api.conftest import Login, MakePlayer

TRAINING_DAY = "2026-10-14"  # miércoles de la semana del lunes 2026-10-12
MONDAY = "2026-10-12"


async def new_session(client: AsyncClient, headers: dict[str, str], kind: str = "training"):  # type: ignore[no-untyped-def]
    return await client.post(
        "/sessions",
        json={"kind": kind, "held_on": TRAINING_DAY, "notes": "Pista 2"},
        headers=headers,
    )


async def save_attendance(client, headers, session_id, records):  # type: ignore[no-untyped-def]
    return await client.put(
        f"/sessions/{session_id}/attendance", json={"records": records}, headers=headers
    )


def record(player_id: object, status: str, notified: bool = False, minutes_late: int = 0) -> dict:  # type: ignore[type-arg]
    return {
        "player_id": str(player_id),
        "status": status,
        "notified": notified,
        "minutes_late": minutes_late,
    }


async def test_head_coach_creates_and_lists_sessions_of_a_week(
    client: AsyncClient, login: Login
) -> None:
    headers = await login()

    created = await new_session(client, headers)
    listing = await client.get("/sessions", params={"week": MONDAY}, headers=headers)
    other_week = await client.get("/sessions", params={"week": "2026-10-19"}, headers=headers)

    assert created.status_code == 201
    assert created.json()["data"]["kind"] == "training"
    assert [s["id"] for s in listing.json()["data"]] == [created.json()["data"]["id"]]
    assert other_week.json()["data"] == []


async def test_assistant_coach_cannot_use_points_endpoints(
    client: AsyncClient, login: Login
) -> None:
    head = await login(Role.HEAD_COACH)
    assistant = await login(Role.ASSISTANT_COACH)
    session_id = (await new_session(client, head)).json()["data"]["id"]

    responses = [
        await new_session(client, assistant),
        await client.get("/sessions", params={"week": MONDAY}, headers=assistant),
        await save_attendance(client, assistant, session_id, []),
        await client.post(
            f"/sessions/{session_id}/wins",
            json={"kind": "exercise", "player_ids": []},
            headers=assistant,
        ),
    ]

    assert [r.status_code for r in responses] == [403, 403, 403, 403]


async def test_listing_requires_a_monday_week(client: AsyncClient, login: Login) -> None:
    headers = await login()

    response = await client.get("/sessions", params={"week": TRAINING_DAY}, headers=headers)

    assert response.status_code == 422


async def test_attendance_proposes_the_matching_infractions(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    session_id = (await new_session(client, headers)).json()["data"]["id"]
    present, justified, absent, late, notified_absence = [await make_player(n) for n in range(1, 6)]

    response = await save_attendance(
        client,
        headers,
        session_id,
        [
            record(present.id, "attended"),
            record(justified.id, "justified", notified=True),
            record(absent.id, "unjustified"),
            record(late.id, "late", minutes_late=30),
            record(notified_absence.id, "unjustified", notified=True),
        ],
    )

    data = response.json()["data"]
    codes = {p["player_id"]: p["infraction_code"] for p in data["proposals"]}
    assert response.status_code == 200
    assert data["saved"] == 5
    assert codes == {
        str(absent.id): "MG-a",
        str(late.id): "MG-b",
        str(notified_absence.id): "G-a",
    }


async def test_attendance_proposal_never_creates_a_movement(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    session_id = (await new_session(client, headers)).json()["data"]["id"]
    player = await make_player(1)

    await save_attendance(client, headers, session_id, [record(player.id, "unjustified")])
    movements = await client.get("/movements", params={"week": MONDAY}, headers=headers)

    assert movements.json()["data"] == []


async def test_match_absence_proposal_carries_the_sanction(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    session_id = (await new_session(client, headers, kind="match")).json()["data"]["id"]
    player = await make_player(1)

    response = await save_attendance(
        client, headers, session_id, [record(player.id, "unjustified")]
    )

    sanction = response.json()["data"]["proposals"][0]["sanction"]
    assert sanction == {"kind": "no_callup", "min_matches": 1, "max_matches": 2}


async def test_saving_attendance_again_replaces_the_previous_record(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    session_id = (await new_session(client, headers)).json()["data"]["id"]
    player = await make_player(1)
    await save_attendance(client, headers, session_id, [record(player.id, "unjustified")])

    response = await save_attendance(client, headers, session_id, [record(player.id, "attended")])
    stored = await client.get(f"/sessions/{session_id}/attendance", headers=headers)

    assert response.json()["data"]["proposals"] == []
    assert [r["status"] for r in stored.json()["data"]] == ["attended"]


async def test_attendance_rejects_unknown_player_session_and_bad_payloads(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    session_id = (await new_session(client, headers)).json()["data"]["id"]
    player = await make_player(1)

    unknown_player = await save_attendance(
        client, headers, session_id, [record(uuid.uuid4(), "attended")]
    )
    unknown_session = await save_attendance(
        client, headers, uuid.uuid4(), [record(player.id, "attended")]
    )
    bad_status = await save_attendance(client, headers, session_id, [record(player.id, "maybe")])
    duplicated = await save_attendance(
        client, headers, session_id, [record(player.id, "attended"), record(player.id, "late")]
    )
    negative_minutes = await save_attendance(
        client, headers, session_id, [record(player.id, "late", minutes_late=-5)]
    )

    assert unknown_player.status_code == 404
    assert unknown_session.status_code == 404
    assert bad_status.status_code == 422
    assert duplicated.status_code == 422
    assert negative_minutes.status_code == 422


async def test_wins_create_one_movement_per_winner_in_the_session_week(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    session_id = (await new_session(client, headers)).json()["data"]["id"]
    first, second = await make_player(1), await make_player(2)

    response = await client.post(
        f"/sessions/{session_id}/wins",
        json={"kind": "scrimmage", "player_ids": [str(first.id), str(second.id)]},
        headers=headers,
    )

    movements = response.json()["data"]["movements"]
    assert response.status_code == 201
    assert sorted(m["points"] for m in movements) == [5, 5]
    assert {m["applies_week"] for m in movements} == {MONDAY}
    assert {m["session_id"] for m in movements} == {session_id}


async def test_a_draw_creates_no_movements(client: AsyncClient, login: Login) -> None:
    headers = await login()
    session_id = (await new_session(client, headers)).json()["data"]["id"]

    response = await client.post(
        f"/sessions/{session_id}/wins",
        json={"kind": "scrimmage", "player_ids": []},
        headers=headers,
    )

    assert response.status_code == 201
    assert response.json()["data"]["movements"] == []


async def test_wins_reject_unknown_players_and_kinds(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    session_id = (await new_session(client, headers)).json()["data"]["id"]
    player = await make_player(1)

    unknown = await client.post(
        f"/sessions/{session_id}/wins",
        json={"kind": "exercise", "player_ids": [str(uuid.uuid4())]},
        headers=headers,
    )
    bad_kind = await client.post(
        f"/sessions/{session_id}/wins",
        json={"kind": "goal", "player_ids": [str(player.id)]},
        headers=headers,
    )

    assert unknown.status_code == 404
    assert bad_kind.status_code == 422
