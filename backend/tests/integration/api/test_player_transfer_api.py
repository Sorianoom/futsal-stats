"""Traspaso de lo anotado en un partido de un jugador a otro (se apuntó a uno por otro)."""

from typing import Any

from httpx import AsyncClient

from app.domain.roles import Role
from tests.integration.api.conftest import Login, MakePlayer
from tests.integration.api.test_stats_api import by_player, played_match


async def _transfer(
    client: AsyncClient, headers: dict[str, str], match_id: str, source: Any, target: Any
) -> Any:
    body = {"from_player_id": str(source.id), "to_player_id": str(target.id)}
    return await client.post(f"/matches/{match_id}/player-transfer", json=body, headers=headers)


async def test_everything_of_the_player_moves_to_the_other_mid_match(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id, p = await played_match(client, headers, make_player, finalize=False)
    real = await make_player(20)

    response = await _transfer(client, headers, match_id, p[0], real)
    events = (await client.get(f"/matches/{match_id}/events", headers=headers)).json()["data"]
    lineup = (await client.get(f"/matches/{match_id}/lineup-events", headers=headers)).json()[
        "data"
    ]
    finalized = await client.post(f"/matches/{match_id}/finalize", headers=headers)
    stats = (await client.get(f"/matches/{match_id}/stats", headers=headers)).json()["data"]

    assert response.status_code == 200, response.text
    assert response.json()["data"]["changed"] > 0
    assert str(p[0].id) not in {e["player_id"] for e in events}
    assert str(p[0].id) not in str(lineup)
    assert str(real.id) in str(lineup)
    assert finalized.status_code == 200, finalized.text
    rows = by_player(stats)
    assert str(p[0].id) not in rows
    assert rows[str(real.id)]["goals"] == 1


async def test_a_closed_match_also_moves_its_stints(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id, p = await played_match(client, headers, make_player)
    before = by_player(
        (await client.get(f"/matches/{match_id}/stats", headers=headers)).json()["data"]
    )
    real = await make_player(20)

    await _transfer(client, headers, match_id, p[0], real)
    after = by_player(
        (await client.get(f"/matches/{match_id}/stats", headers=headers)).json()["data"]
    )

    moved = after[str(real.id)]
    assert moved["seconds"] == before[str(p[0].id)]["seconds"]
    assert moved["goals"] == before[str(p[0].id)]["goals"]


async def test_the_target_must_not_be_in_the_match(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id, p = await played_match(client, headers, make_player, finalize=False)
    outsider = await make_player(20)

    into_player = await _transfer(client, headers, match_id, p[0], p[1])
    same = await _transfer(client, headers, match_id, p[0], p[0])
    nothing = await _transfer(client, headers, match_id, outsider, p[0])

    assert (into_player.status_code, into_player.json()["error"]["code"]) == (
        409,
        "player_in_match",
    )
    assert same.json()["error"]["code"] == "same_player"
    assert nothing.json()["error"]["code"] == "nothing_to_transfer"


async def test_only_staff_transfers(
    client: AsyncClient, login: Login, make_player: MakePlayer, player_headers: dict[str, str]
) -> None:
    headers = await login(Role.HEAD_COACH)
    match_id, p = await played_match(client, headers, make_player, finalize=False)
    real = await make_player(20)

    response = await _transfer(client, player_headers, match_id, p[0], real)

    assert response.status_code == 403


async def test_the_head_coach_clears_all_the_stats_of_a_match(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login(Role.HEAD_COACH)
    match_id, _ = await played_match(client, headers, make_player)

    response = await client.delete(f"/matches/{match_id}/stats", headers=headers)
    events = (await client.get(f"/matches/{match_id}/events", headers=headers)).json()["data"]
    lineup = (await client.get(f"/matches/{match_id}/lineup-events", headers=headers)).json()[
        "data"
    ]
    stints = (await client.get(f"/matches/{match_id}/stints", headers=headers)).json()["data"]

    assert response.status_code == 200, response.text
    assert response.json()["data"]["changed"] > 0
    assert (events, lineup, stints) == ([], [], [])


async def test_only_the_head_coach_clears_stats(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    coach = await login(Role.HEAD_COACH)
    match_id, _ = await played_match(client, coach, make_player)
    assistant = await login(Role.ASSISTANT_COACH)

    response = await client.delete(f"/matches/{match_id}/stats", headers=assistant)

    assert response.status_code == 403
