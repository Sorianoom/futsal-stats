"""Estadísticas acumuladas por jugador de todos los partidos cerrados."""

import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import MatchEvent
from app.domain.roles import Role
from app.domain.stints.events import EventKind
from tests.integration.api.conftest import Login, MakePlayer
from tests.integration.api.test_stats_api import event, played_match


def rows(response_json: dict) -> dict[str, dict]:  # type: ignore[type-arg]
    return {row["player_id"]: row for row in response_json["data"]["players"]}


async def two_closed_matches(client, headers, make_player):  # type: ignore[no-untyped-def]
    _, players = await played_match(client, headers, make_player)
    await played_match(client, headers, make_player, players=players)
    return players


async def test_totals_add_up_across_the_closed_matches(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    p = await two_closed_matches(client, headers, make_player)

    response = await client.get("/stats/players", headers=headers)

    data = response.json()["data"]
    by_id = rows(response.json())
    assert response.status_code == 200
    assert data["matches"] == 2
    assert by_id[str(p[0].id)]["seconds"] == 2 * 300
    assert by_id[str(p[0].id)]["goals"] == 2
    assert by_id[str(p[5].id)]["seconds"] == 2 * (900 + 1200)
    assert by_id[str(p[1].id)]["assists"] == 2
    assert by_id[str(p[1].id)]["yellows"] == 2
    assert by_id[str(p[2].id)]["fouls"] == 4
    assert by_id[str(p[3].id)]["fouls"] == 0  # el deshecho no cuenta en ningún partido


async def test_matches_played_counts_the_matches_where_the_player_was_on_court(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    p = await two_closed_matches(client, headers, make_player)

    by_id = rows((await client.get("/stats/players", headers=headers)).json())

    assert all(by_id[str(player.id)]["matches_played"] == 2 for player in p)


async def test_matches_that_are_not_closed_do_not_count(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    p = await two_closed_matches(client, headers, make_player)
    await played_match(client, headers, make_player, players=p, finalize=False)

    response = await client.get("/stats/players", headers=headers)

    assert response.json()["data"]["matches"] == 2
    assert rows(response.json())[str(p[0].id)]["goals"] == 2


async def test_players_are_sorted_by_minutes_and_carry_name_and_dorsal(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    p = await two_closed_matches(client, headers, make_player)

    players = (await client.get("/stats/players", headers=headers)).json()["data"]["players"]

    assert [row["seconds"] for row in players] == sorted(
        (r["seconds"] for r in players), reverse=True
    )
    first = next(row for row in players if row["player_id"] == str(p[0].id))
    assert (first["name"], first["dorsal"]) == ("Jugador 1", 1)


async def test_without_closed_matches_the_season_is_empty(
    client: AsyncClient, login: Login
) -> None:
    headers = await login()

    response = await client.get("/stats/players", headers=headers)

    assert response.json()["data"] == {"matches": 0, "players": [], "warnings": [], "goals": []}


async def test_a_match_with_inconsistent_events_is_skipped_with_a_warning(
    client: AsyncClient, login: Login, make_player: MakePlayer, session: AsyncSession
) -> None:
    headers = await login()
    _, p = await played_match(client, headers, make_player)
    broken_id, _ = await played_match(client, headers, make_player, players=p)
    # Deshacer dos veces el mismo evento: la API no lo permite, pero un fallo de datos podría
    # dejarlo así y no debe romper toda la pantalla de temporada.
    stored = (await client.get(f"/matches/{broken_id}/events", headers=headers)).json()["data"]
    already_undone = next(e["voids_event_id"] for e in stored if e["kind"] == "undo")
    session.add(
        MatchEvent(
            id=uuid.uuid4(),
            match_id=uuid.UUID(broken_id),
            seq=99,
            kind=EventKind.UNDO,
            part=1,
            t=10,
            player_id=None,
            voids_event_id=uuid.UUID(already_undone),
        )
    )
    await session.flush()

    response = await client.get("/stats/players", headers=headers)

    data = response.json()["data"]
    assert response.status_code == 200
    assert data["matches"] == 1
    assert any("incoherentes" in warning for warning in data["warnings"])


async def test_both_roles_can_read_and_anonymous_cannot(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    head = await login(Role.HEAD_COACH)
    assistant = await login(Role.ASSISTANT_COACH)
    await two_closed_matches(client, head, make_player)

    as_head = await client.get("/stats/players", headers=head)
    as_assistant = await client.get("/stats/players", headers=assistant)
    anonymous = await client.get("/stats/players")

    assert as_head.json()["data"] == as_assistant.json()["data"]
    assert anonymous.status_code == 401


async def test_saves_add_up_across_the_closed_matches(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login()
    p = [await make_player(n) for n in range(1, 7)]
    await played_match(client, headers, make_player, [event(20, "save", 1, 500, p[1])], players=p)
    await played_match(client, headers, make_player, [event(20, "save", 2, 50, p[1])], players=p)

    by_id = rows((await client.get("/stats/players", headers=headers)).json())

    assert by_id[str(p[1].id)]["saves"] == 2
    assert by_id[str(p[0].id)]["saves"] == 0
    assert "rating" not in by_id[str(p[1].id)]
