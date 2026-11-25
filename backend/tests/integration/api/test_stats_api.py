"""Estadísticas de un partido: minutos y acciones por jugador, quintetos y resumen de equipo."""

import uuid
from typing import Any

import pytest
from httpx import AsyncClient

from app.db.models import Player
from app.domain.points.callup import Position
from app.domain.rating import RatingInput, player_rating
from app.domain.roles import Role
from tests.integration.api.conftest import Login, MakePlayer
from tests.integration.api.test_stints_api import full_match, new_match


def event(
    seq: int,
    kind: str,
    part: int,
    t: int,
    player: Player | None = None,
    voids: str | None = None,
    id_: str | None = None,
) -> dict[str, Any]:
    return {
        "id": id_ or str(uuid.uuid4()),
        "seq": seq,
        "kind": kind,
        "part": part,
        "t": t,
        "player_id": str(player.id) if player else None,
        "voids_event_id": voids,
    }


async def sync(client, headers, match_id, **streams):  # type: ignore[no-untyped-def]
    body = {"events": [], "lineup_events": [], "ratings": [], **streams}
    response = await client.post(f"/matches/{match_id}/sync", json=body, headers=headers)
    assert response.status_code == 200, response.text
    return response


async def played_match(client, headers, make_player, extra_events=(), players=None, finalize=True):  # type: ignore[no-untyped-def]
    """p1 juega 0-300 de la parte 1 y p6 lo releva; p2..p6 juegan la parte 2 entera."""
    match_id = await new_match(client, headers)
    p = players or [await make_player(n) for n in range(1, 7)]
    lineup = [
        {"id": str(uuid.uuid4()), "seq": seq, "payload": payload}
        for seq, payload in enumerate(full_match(p), start=1)
    ]
    foul_to_undo = str(uuid.uuid4())
    events = [
        event(1, "goal", 1, 100, p[0]),
        event(2, "rival_goal", 1, 700),
        event(3, "goal", 1, 1000, p[5]),
        event(4, "assist", 1, 1000, p[1]),
        event(5, "foul", 1, 400, p[2]),
        event(6, "foul", 1, 450, p[3], id_=foul_to_undo),
        event(7, "undo", 1, 450, voids=foul_to_undo),
        event(8, "foul", 2, 200, p[2]),
        event(9, "yellow", 2, 300, p[1]),
        event(10, "shot", 2, 500, p[4]),
        event(11, "steal", 2, 600, p[4]),
        event(12, "turnover", 2, 700, p[5]),
        event(19, "key_action", 2, 800, p[4]),
        *extra_events,
    ]
    ratings = [
        {"id": str(uuid.uuid4()), "part": 1, "t": 250, "stars": 5},
        {"id": str(uuid.uuid4()), "part": 2, "t": 100, "stars": 3},
    ]
    await sync(client, headers, match_id, lineup_events=lineup, events=events, ratings=ratings)
    if finalize:
        await client.post(f"/matches/{match_id}/finalize", headers=headers)
    return match_id, p


def by_player(stats: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {row["player_id"]: row for row in stats["players"]}


def by_quintet(stats: dict[str, Any]) -> dict[frozenset[str], dict[str, Any]]:
    return {frozenset(q["player_ids"]): q for q in stats["quintets"]}


async def test_a_closed_match_reports_score_fouls_minutes_and_actions(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id, p = await played_match(client, headers, make_player)

    response = await client.get(f"/matches/{match_id}/stats", headers=headers)

    stats = response.json()["data"]
    rows = by_player(stats)
    assert response.status_code == 200
    assert stats["closed"] is True
    assert stats["score"] == {"goals_for": 2, "goals_against": 1}
    assert stats["team_fouls"] == [{"part": 1, "fouls": 1}, {"part": 2, "fouls": 1}]
    assert rows[str(p[0].id)]["seconds"] == 300
    assert rows[str(p[5].id)]["seconds"] == 900 + 1200
    assert rows[str(p[1].id)]["seconds"] == 2400
    assert rows[str(p[0].id)]["goals"] == 1
    assert rows[str(p[5].id)]["goals"] == 1
    assert rows[str(p[1].id)]["assists"] == 1
    assert rows[str(p[1].id)]["yellows"] == 1
    assert rows[str(p[2].id)]["fouls"] == 2
    assert rows[str(p[4].id)]["shots"] == 1 and rows[str(p[4].id)]["steals"] == 1
    assert rows[str(p[4].id)]["key_actions"] == 1 and rows[str(p[5].id)]["key_actions"] == 0
    assert rows[str(p[5].id)]["turnovers"] == 1


async def test_undone_events_do_not_count(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id, p = await played_match(client, headers, make_player)

    stats = (await client.get(f"/matches/{match_id}/stats", headers=headers)).json()["data"]

    assert by_player(stats)[str(p[3].id)]["fouls"] == 0
    assert sum(t["fouls"] for t in stats["team_fouls"]) == 2


async def test_players_come_with_their_name_and_dorsal(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id, p = await played_match(client, headers, make_player)

    stats = (await client.get(f"/matches/{match_id}/stats", headers=headers)).json()["data"]

    row = by_player(stats)[str(p[0].id)]
    assert (row["name"], row["dorsal"]) == ("Jugador 1", 1)


async def test_quintets_report_time_goals_and_average_rating(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id, p = await played_match(client, headers, make_player)
    ids = [str(x.id) for x in p]

    stats = (await client.get(f"/matches/{match_id}/stats", headers=headers)).json()["data"]

    quintets = by_quintet(stats)
    first = quintets[frozenset(ids[:5])]
    assert (first["seconds"], first["goals_for"], first["goals_against"]) == (300, 1, 0)
    assert (first["rating_count"], first["rating_average"]) == (1, 5.0)
    second = quintets[frozenset(ids[1:6])]
    assert (second["seconds"], second["goals_for"], second["goals_against"]) == (2100, 1, 1)
    assert (second["rating_count"], second["rating_average"]) == (1, 3.0)
    assert [q["seconds"] for q in stats["quintets"]] == sorted(
        (q["seconds"] for q in stats["quintets"]), reverse=True
    )


async def test_an_unclosed_match_has_actions_but_no_minutes_or_quintets(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id = await new_match(client, headers)
    player = await make_player(7)
    await sync(client, headers, match_id, events=[event(1, "goal", 1, 100, player)])

    stats = (await client.get(f"/matches/{match_id}/stats", headers=headers)).json()["data"]

    assert stats["closed"] is False
    assert stats["quintets"] == []
    row = by_player(stats)[str(player.id)]
    assert (row["goals"], row["seconds"]) == (1, 0)
    assert stats["score"] == {"goals_for": 1, "goals_against": 0}


async def test_statistics_follow_manual_corrections_of_the_stints(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id, p = await played_match(client, headers, make_player)
    stints = (await client.get(f"/matches/{match_id}/stints", headers=headers)).json()["data"]
    first_stint = next(s for s in stints if s["player_id"] == str(p[0].id))

    await client.delete(f"/stints/{first_stint['id']}", headers=headers)
    stats = (await client.get(f"/matches/{match_id}/stats", headers=headers)).json()["data"]

    assert by_player(stats)[str(p[0].id)]["seconds"] == 0


async def test_events_outside_the_stints_count_for_players_but_not_for_quintets(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    late_goal = event(13, "goal", 2, 1500, None)
    match_id, p = await played_match(client, headers, make_player)
    late_goal["player_id"] = str(p[1].id)
    await sync(client, headers, match_id, events=[late_goal])

    stats = (await client.get(f"/matches/{match_id}/stats", headers=headers)).json()["data"]

    assert stats["score"]["goals_for"] == 3
    assert by_player(stats)[str(p[1].id)]["goals"] == 1
    assert sum(q["goals_for"] for q in stats["quintets"]) == 2
    assert any("fuera de los tramos" in warning for warning in stats["warnings"])


async def test_both_roles_can_read_and_unknown_or_anonymous_are_rejected(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    head = await login(Role.HEAD_COACH)
    assistant = await login(Role.ASSISTANT_COACH)
    match_id, _ = await played_match(client, head, make_player)

    as_head = await client.get(f"/matches/{match_id}/stats", headers=head)
    as_assistant = await client.get(f"/matches/{match_id}/stats", headers=assistant)
    unknown = await client.get(f"/matches/{uuid.uuid4()}/stats", headers=head)
    anonymous = await client.get(f"/matches/{match_id}/stats")

    assert as_head.json()["data"] == as_assistant.json()["data"]
    assert (unknown.status_code, anonymous.status_code) == (404, 401)


async def players_with_goalkeeper(make_player: MakePlayer) -> list[Player]:
    """p2 (dorsal 2) es portero y juega todo el partido; el resto son de campo."""
    return [
        await make_player(n, position=Position.GOALKEEPER if n == 2 else Position.FIELD)
        for n in range(1, 7)
    ]


async def test_saves_are_counted_and_undone_saves_are_not(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    p = await players_with_goalkeeper(make_player)
    undone = str(uuid.uuid4())
    saves = [
        event(20, "save", 1, 500, p[1]),
        event(21, "save", 2, 800, p[1]),
        event(22, "save", 2, 900, p[1], id_=undone),
        event(23, "undo", 2, 900, voids=undone),
    ]
    match_id, _ = await played_match(client, headers, make_player, saves, players=p)

    stats = (await client.get(f"/matches/{match_id}/stats", headers=headers)).json()["data"]

    rows = by_player(stats)
    assert rows[str(p[1].id)]["saves"] == 2
    assert rows[str(p[0].id)]["saves"] == 0


async def test_a_field_player_rating_uses_actions_minutes_and_goals_on_court(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id, p = await played_match(client, headers, make_player)

    stats = (await client.get(f"/matches/{match_id}/stats", headers=headers)).json()["data"]

    # p5 juega los 2400 s, con un tiro sin gol y un robo, y está en pista en los tres goles.
    expected = player_rating(
        RatingInput(
            is_goalkeeper=False,
            seconds=2400,
            shots=1,
            steals=1,
            key_actions=1,
            goals_for_on_court=2,
            goals_against_on_court=1,
            clean_streaks=3,  # 700 s antes del gol en contra (1 bloque) y 1700 s después (2)
        )
    )
    rating = by_player(stats)[str(p[4].id)]["rating"]
    assert expected is not None
    assert rating == pytest.approx(expected)
    assert 1 <= rating <= 10


async def test_a_goalkeeper_rating_counts_saves_and_goals_conceded_on_court(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    p = await players_with_goalkeeper(make_player)
    saves = [event(20, "save", 1, 500, p[1]), event(21, "save", 2, 800, p[1])]
    match_id, _ = await played_match(client, headers, make_player, saves, players=p)

    stats = (await client.get(f"/matches/{match_id}/stats", headers=headers)).json()["data"]

    expected = player_rating(
        RatingInput(
            is_goalkeeper=True,
            seconds=2400,
            assists=1,
            yellows=1,
            saves=2,
            goals_for_on_court=2,
            goals_against_on_court=1,
            clean_streaks=3,  # 700 s antes del gol en contra (1 bloque) y 1700 s después (2)
        )
    )
    assert expected is not None
    assert by_player(stats)[str(p[1].id)]["rating"] == pytest.approx(expected)


async def test_a_goal_scorer_keeps_shots_as_recorded_because_a_goal_is_not_a_shot(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id, p = await played_match(client, headers, make_player)

    stats = (await client.get(f"/matches/{match_id}/stats", headers=headers)).json()["data"]

    # p1 marca a los 100 s en el quinteto inicial (en pista: 1 a favor, 0 en contra).
    expected = player_rating(
        RatingInput(is_goalkeeper=False, seconds=300, goals=1, goals_for_on_court=1)
    )
    row = by_player(stats)[str(p[0].id)]
    assert (row["goals"], row["shots"]) == (1, 0)
    assert row["rating"] == pytest.approx(expected)


async def test_a_player_with_less_than_three_minutes_has_no_rating(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id, p = await played_match(client, headers, make_player)
    stints = (await client.get(f"/matches/{match_id}/stints", headers=headers)).json()["data"]
    first_stint = next(s for s in stints if s["player_id"] == str(p[0].id))
    await client.patch(f"/stints/{first_stint['id']}", json={"end_s": 150}, headers=headers)

    stats = (await client.get(f"/matches/{match_id}/stats", headers=headers)).json()["data"]

    row = by_player(stats)[str(p[0].id)]
    assert (row["seconds"], row["rating"]) == (150, None)


async def test_an_unclosed_match_has_no_ratings(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id, _ = await played_match(client, headers, make_player, finalize=False)

    stats = (await client.get(f"/matches/{match_id}/stats", headers=headers)).json()["data"]

    assert stats["players"] and all(row["rating"] is None for row in stats["players"])


async def test_goals_outside_the_stints_do_not_count_on_court_for_the_rating(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id, p = await played_match(client, headers, make_player)
    late_rival_goal = event(13, "rival_goal", 2, 1500)
    await sync(client, headers, match_id, events=[late_rival_goal])

    stats = (await client.get(f"/matches/{match_id}/stats", headers=headers)).json()["data"]

    expected = player_rating(
        RatingInput(
            is_goalkeeper=False,
            seconds=2400,
            shots=1,
            steals=1,
            key_actions=1,
            goals_for_on_court=2,
            goals_against_on_court=1,
            clean_streaks=3,  # 700 s antes del gol en contra (1 bloque) y 1700 s después (2)
        )
    )
    assert stats["score"]["goals_against"] == 2
    assert by_player(stats)[str(p[4].id)]["rating"] == pytest.approx(expected)


async def stats_with_a_warning(client, login, make_player):  # type: ignore[no-untyped-def]
    """Partido cerrado con quintetos, notas y un aviso (un gol fuera de los tramos)."""
    headers = await login()
    match_id, p = await played_match(client, headers, make_player)
    late_goal = event(13, "goal", 2, 1500, p[1])
    await sync(client, headers, match_id, events=[late_goal])
    return match_id, headers


async def test_a_player_sees_ratings_but_not_quintets_or_warnings(
    client: AsyncClient, login: Login, make_player: MakePlayer, player_headers: dict[str, str]
) -> None:
    match_id, staff = await stats_with_a_warning(client, login, make_player)

    seen_by_player = (
        await client.get(f"/matches/{match_id}/stats", headers=player_headers)
    ).json()["data"]
    seen_by_staff = (await client.get(f"/matches/{match_id}/stats", headers=staff)).json()["data"]

    assert (seen_by_player["quintets"], seen_by_player["warnings"]) == ([], [])
    assert seen_by_staff["quintets"] and seen_by_staff["warnings"]
    assert seen_by_player["players"] == seen_by_staff["players"]
    assert any(row["rating"] is not None for row in seen_by_player["players"])
    assert seen_by_player["score"] == seen_by_staff["score"]


async def test_the_assistant_coach_sees_quintets_and_warnings(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    match_id, _ = await stats_with_a_warning(client, login, make_player)
    assistant = await login(Role.ASSISTANT_COACH)

    stats = (await client.get(f"/matches/{match_id}/stats", headers=assistant)).json()["data"]

    assert stats["quintets"] and stats["warnings"]


async def test_stats_list_each_goal_with_its_detail(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    match_id, p = await played_match(client, headers, make_player)
    events = (await client.get(f"/matches/{match_id}/events", headers=headers)).json()["data"]
    rival = next(e for e in events if e["kind"] == "rival_goal")
    body = {"goal_tags": ["counter"], "goal_x": 50, "goal_y": 20}
    await client.put(
        f"/matches/{match_id}/events/{rival['id']}/goal-detail", json=body, headers=headers
    )

    match_goals = (await client.get(f"/matches/{match_id}/stats", headers=headers)).json()["data"][
        "goals"
    ]
    season_goals = (await client.get("/stats/players", headers=headers)).json()["data"]["goals"]

    against = [g for g in match_goals if not g["for_team"]]
    assert [g["for_team"] for g in match_goals].count(True) == 2
    assert against == [
        {
            "event_id": rival["id"],
            "for_team": False,
            "part": 1,
            "t": 700,
            "player_id": None,
            "tags": ["counter"],
            "x": 50,
            "y": 20,
        }
    ]
    assert next(g for g in match_goals if g["player_id"] == str(p[0].id))["tags"] == []
    assert sorted(g["event_id"] for g in season_goals) == sorted(g["event_id"] for g in match_goals)
