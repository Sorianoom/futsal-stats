"""Fantasy, paso 2: liga, copias, plantillas iniciales, alineaciones, puntos y clasificación.

El reloj y el azar se inyectan (`get_now`, `get_rng`) para fijar el bloqueo de las jornadas y el
reparto de copias.
"""

import random
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_now, get_rng
from app.config import get_settings
from app.db.models import FantasyCopy, Player
from app.db.session import get_session
from app.domain.fantasy.rules import (
    COPIES_PER_FIELD_PLAYER,
    COPIES_PER_GOALKEEPER,
    INITIAL_BALANCE,
    INITIAL_FIELD_COPIES,
    INITIAL_PLAYER_VALUE,
)
from app.domain.fantasy.scoring import player_points
from app.domain.points.callup import Position
from app.domain.roles import Role
from app.main import create_app
from tests.integration.api.conftest import TEST_SETTINGS, Login, MakePlayer, MakeUser
from tests.integration.api.test_stats_api import played_match

SEED = 20261110
# Liga creada el 10/10/2026; el partido de `played_match` es el 17/10/2026.
LEAGUE_DAY = datetime(2026, 10, 10, 10, 0, tzinfo=UTC)
BEFORE_LOCK = datetime(2026, 10, 16, 21, 59, tzinfo=UTC)  # 23:59 en Madrid
AFTER_LOCK = datetime(2026, 10, 16, 22, 0, tzinfo=UTC)  # 00:00 del 17 en Madrid
# Noche del partido: jornada puntuada pero provisional (se cierra a las 00:00 del 18).
AFTER_MATCH = datetime(2026, 10, 17, 20, 0, tzinfo=UTC)
MATCH_DAY = "2026-10-17"


@dataclass
class Clock:
    now: datetime


@pytest.fixture
def clock() -> Clock:
    return Clock(LEAGUE_DAY)


@pytest.fixture
async def client(session: AsyncSession, clock: Clock) -> AsyncIterator[AsyncClient]:
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[get_settings] = lambda: TEST_SETTINGS
    app.dependency_overrides[get_now] = lambda: clock.now
    app.dependency_overrides[get_rng] = lambda: random.Random(SEED)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        yield http
    app.dependency_overrides.clear()


async def _field_players(make_player: MakePlayer, count: int = 6) -> list[Player]:
    return [await make_player(n) for n in range(1, count + 1)]


async def _create_league(client: AsyncClient, headers: dict[str, str]) -> dict[str, Any]:
    response = await client.post("/fantasy/league", headers=headers)
    assert response.status_code == 201, response.text
    data: dict[str, Any] = response.json()["data"]
    return data


async def _me(client: AsyncClient, headers: dict[str, str]) -> dict[str, Any]:
    response = await client.get("/fantasy/me", headers=headers)
    assert response.status_code == 200, response.text
    data: dict[str, Any] = response.json()["data"]
    return data


async def _put_lineup(
    client: AsyncClient,
    headers: dict[str, str],
    goalkeeper: str | None = None,
    field: list[str | None] | None = None,
    captain: str | None = None,
) -> Any:
    body = {
        "goalkeeper_copy_id": goalkeeper,
        "field_copy_ids": field or [],
        "captain_copy_id": captain,
    }
    return await client.put("/fantasy/lineup", json=body, headers=headers)


async def _new_match(
    client: AsyncClient, headers: dict[str, str], held_on: str, official: bool = True
) -> str:
    body = {"held_on": held_on, "opponent": "Rival FS", "is_official": official}
    response = await client.post("/matches", json=body, headers=headers)
    return str(response.json()["data"]["id"])


# --- Liga ----------------------------------------------------------------------------------------


async def test_the_head_coach_creates_the_league_with_every_active_user(
    client: AsyncClient, login: Login, make_user: MakeUser, make_player: MakePlayer
) -> None:
    await _field_players(make_player)
    headers = await login()
    await login(Role.ASSISTANT_COACH)
    await make_user(email="baja@club.es", role=Role.ASSISTANT_COACH, active=False)

    league = await _create_league(client, headers)

    assert league["participants"] == 2
    assert league["starts_on"] == "2026-10-10"
    uuid.UUID(league["id"])


async def test_only_one_league_can_be_active(client: AsyncClient, login: Login) -> None:
    headers = await login()
    await _create_league(client, headers)

    response = await client.post("/fantasy/league", headers=headers)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "league_exists"


async def test_the_assistant_coach_cannot_create_the_league(
    client: AsyncClient, login: Login
) -> None:
    headers = await login(Role.ASSISTANT_COACH)

    response = await client.post("/fantasy/league", headers=headers)

    assert response.status_code == 403


async def test_the_league_starts_on_the_madrid_date(
    client: AsyncClient, login: Login, clock: Clock
) -> None:
    clock.now = datetime(2026, 10, 9, 22, 30, tzinfo=UTC)  # 00:30 del 10 en Madrid
    headers = await login()

    league = await _create_league(client, headers)

    assert league["starts_on"] == "2026-10-10"


async def test_every_active_player_gets_its_copies(
    client: AsyncClient, login: Login, make_player: MakePlayer, session: AsyncSession
) -> None:
    goalkeeper = await make_player(1, Position.GOALKEEPER)
    field = await make_player(2)
    gone = await make_player(3)
    gone.is_active = False
    await session.flush()
    headers = await login()

    await _create_league(client, headers)

    counts = await _copy_counts(session)
    assert counts == {goalkeeper.id: COPIES_PER_GOALKEEPER, field.id: COPIES_PER_FIELD_PLAYER}


async def _copy_counts(session: AsyncSession) -> dict[uuid.UUID, int]:
    query = select(FantasyCopy.player_id, func.count()).group_by(FantasyCopy.player_id)
    return {player_id: total for player_id, total in (await session.execute(query)).all()}


# --- Mi equipo -----------------------------------------------------------------------------------


async def test_without_league_me_says_so(client: AsyncClient, login: Login) -> None:
    headers = await login()

    assert await _me(client, headers) == {"league": None}


async def test_each_participant_starts_with_two_field_players_and_twenty_millions(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    await make_player(13, Position.GOALKEEPER)
    await _field_players(make_player, 4)
    headers = await login()
    league = await _create_league(client, headers)

    me = await _me(client, headers)

    assert me["league"] == {"id": league["id"], "starts_on": "2026-10-10"}
    assert me["me"]["balance"] == INITIAL_BALANCE
    assert me["me"]["display_name"] == "head_coach"
    squad = me["squad"]
    assert len(squad) == INITIAL_FIELD_COPIES
    assert len({c["player_id"] for c in squad}) == INITIAL_FIELD_COPIES
    assert {c["position"] for c in squad} == {"field"}
    assert {c["value"] for c in squad} == {INITIAL_PLAYER_VALUE}
    assert set(squad[0]) == {
        "copy_id", "player_id", "name", "dorsal", "position", "value", "value_change", "listing",
        "clause", "protected_until", "last_points",
    }  # fmt: skip
    assert me["lineup"] == {
        "goalkeeper_copy_id": None,
        "field_copy_ids": [None] * 4,
        "captain_copy_id": None,
    }
    assert me["next_round"] is None


async def test_participants_never_share_a_copy(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    await _field_players(make_player)
    coach = await login()
    assistant = await login(Role.ASSISTANT_COACH)
    await _create_league(client, coach)

    first = {c["copy_id"] for c in (await _me(client, coach))["squad"]}
    second = {c["copy_id"] for c in (await _me(client, assistant))["squad"]}

    assert len(first) == len(second) == INITIAL_FIELD_COPIES
    assert not first & second


async def test_next_round_is_the_next_official_match_not_locked(
    client: AsyncClient, login: Login, clock: Clock
) -> None:
    headers = await login()
    await _create_league(client, headers)
    await _new_match(client, headers, "2026-10-09")  # antes de la liga
    await _new_match(client, headers, "2026-10-14", official=False)
    match_id = await _new_match(client, headers, MATCH_DAY)

    me = await _me(client, headers)

    assert me["next_round"] == {
        "match_id": match_id,
        "opponent": "Rival FS",
        "held_on": MATCH_DAY,
        "locks_at": "2026-10-17T00:00:00+02:00",
    }
    clock.now = AFTER_LOCK
    assert (await _me(client, headers))["next_round"] is None


async def test_a_late_user_joins_on_first_visit(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    await _field_players(make_player)
    coach = await login()
    await _create_league(client, coach)
    player = await make_player(20, name="Lucas Tardío")
    late = await login(Role.PLAYER, player_id=player.id)

    me = await _me(client, late)

    assert me["me"]["display_name"] == "Lucas Tardío"
    assert me["me"]["balance"] == INITIAL_BALANCE
    assert len(me["squad"]) == INITIAL_FIELD_COPIES
    standings = (await client.get("/fantasy/standings", headers=coach)).json()["data"]
    assert len(standings["rows"]) == 2


async def test_a_late_user_never_gets_a_copy_listed_by_the_bank(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    # Dos de campo: 10 copias, 2 para el entrenador y las 8 libres salen todas en el mercado.
    await _field_players(make_player, 2)
    coach = await login()
    await _create_league(client, coach)
    listings = (await client.get("/fantasy/market", headers=coach)).json()["data"]["listings"]
    player = await make_player(20, name="Lucas Tardío")
    late = await login(Role.PLAYER, player_id=player.id)

    me = await _me(client, late)

    listed = {x["copy_id"] for x in listings}
    assert len(listed) == 8
    assert not listed & {c["copy_id"] for c in me["squad"]}
    assert {c["player_id"] for c in me["squad"]} == {str(player.id)}


async def test_a_player_added_after_the_league_gets_copies_on_the_next_visit(
    client: AsyncClient, login: Login, make_player: MakePlayer, session: AsyncSession
) -> None:
    headers = await login()
    await _create_league(client, headers)
    newcomer = await make_player(30, Position.GOALKEEPER)

    await _me(client, headers)

    assert (await _copy_counts(session))[newcomer.id] == COPIES_PER_GOALKEEPER


# --- Alineación ----------------------------------------------------------------------------------


async def _league_with_squad(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> tuple[dict[str, str], list[str]]:
    await _field_players(make_player)
    headers = await login()
    await _create_league(client, headers)
    squad = [c["copy_id"] for c in (await _me(client, headers))["squad"]]
    return headers, squad


async def test_saving_a_lineup_returns_it_padded_and_me_shows_it(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers, squad = await _league_with_squad(client, login, make_player)

    response = await _put_lineup(client, headers, field=[None, squad[0], squad[1]])

    expected = {
        "goalkeeper_copy_id": None,
        "field_copy_ids": [None, squad[0], squad[1], None],
        "captain_copy_id": None,
    }
    assert response.status_code == 200, response.text
    assert response.json()["data"] == expected
    assert (await _me(client, headers))["lineup"] == expected


async def test_a_lineup_can_have_a_captain(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers, squad = await _league_with_squad(client, login, make_player)

    response = await _put_lineup(client, headers, field=[squad[0], squad[1]], captain=squad[1])

    assert response.status_code == 200, response.text
    assert response.json()["data"]["captain_copy_id"] == squad[1]
    assert (await _me(client, headers))["lineup"]["captain_copy_id"] == squad[1]


async def test_the_captain_must_be_lined_up(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers, squad = await _league_with_squad(client, login, make_player)

    response = await _put_lineup(client, headers, field=[squad[0]], captain=squad[1])

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_lineup"


async def test_invalid_lineups_are_rejected(
    client: AsyncClient,
    login: Login,
    make_player: MakePlayer,
    session: AsyncSession,
) -> None:
    headers, squad = await _league_with_squad(client, login, make_player)
    stranger = await session.scalar(
        select(FantasyCopy.id).where(FantasyCopy.owner_id.is_(None)).limit(1)
    )

    cases = [
        (None, [str(stranger)]),  # copia que no es suya
        (str(uuid.uuid4()), []),  # copia que no existe
        (squad[0], []),  # jugador de campo en la portería
        (None, [squad[0], squad[0]]),  # copia repetida
        (None, [squad[0], None, None, None, squad[1]]),  # más de 4 de campo
    ]
    for goalkeeper, field in cases:
        response = await _put_lineup(client, headers, goalkeeper, field)
        assert response.status_code == 422, (goalkeeper, field)
        assert response.json()["error"]["code"] == "invalid_lineup"


async def test_a_goalkeeper_cannot_play_in_the_field(
    client: AsyncClient, login: Login, make_player: MakePlayer, session: AsyncSession
) -> None:
    headers, _ = await _league_with_squad(client, login, make_player)
    me = await _me(client, headers)
    # Sin mercado todavía, el portero se le da a mano desde la banca.
    gk_player = await make_player(12, Position.GOALKEEPER)
    await _me(client, headers)  # crea sus copias en la banca
    copy = await session.scalar(select(FantasyCopy).where(FantasyCopy.player_id == gk_player.id))
    assert copy is not None
    participant_copy = await session.scalar(
        select(FantasyCopy).where(FantasyCopy.id == uuid.UUID(me["squad"][0]["copy_id"]))
    )
    assert participant_copy is not None
    copy.owner_id, copy.acquired_at = participant_copy.owner_id, AFTER_MATCH
    copy.clause = 6000
    await session.flush()

    in_field = await _put_lineup(client, headers, field=[str(copy.id)])
    in_goal = await _put_lineup(client, headers, goalkeeper=str(copy.id))

    assert in_field.status_code == 422
    assert in_goal.status_code == 200
    assert in_goal.json()["data"]["goalkeeper_copy_id"] == str(copy.id)


async def test_lineup_without_league_is_404(client: AsyncClient, login: Login) -> None:
    headers = await login()

    response = await _put_lineup(client, headers)

    assert response.status_code == 404


# --- Puntos y clasificación ----------------------------------------------------------------------


async def _expected_points(
    client: AsyncClient, headers: dict[str, str], match_id: str, player_ids: list[str]
) -> dict[str, int]:
    stats = (await client.get(f"/matches/{match_id}/stats", headers=headers)).json()["data"]
    rows = {row["player_id"]: row for row in stats["players"]}
    return {
        pid: player_points(rows[pid]["rating"], rows[pid]["goals"]) if pid in rows else 0
        for pid in player_ids
    }


async def _scored_round(
    client: AsyncClient, login: Login, make_player: MakePlayer, clock: Clock
) -> tuple[dict[str, str], str, dict[str, Any], int]:
    """Liga con una alineación de 2 de campo guardada antes del partido del 17, ya cerrado."""
    players = await _field_players(make_player)
    headers = await login()
    await _create_league(client, headers)
    me = await _me(client, headers)
    squad = me["squad"]
    await _put_lineup(client, headers, field=[c["copy_id"] for c in squad])
    match_id, _ = await played_match(client, headers, make_player, players=players)
    clock.now = AFTER_MATCH
    expected = await _expected_points(client, headers, match_id, [c["player_id"] for c in squad])
    return headers, match_id, me, sum(expected.values())


async def test_a_closed_and_locked_round_is_scored(
    client: AsyncClient, login: Login, make_player: MakePlayer, clock: Clock
) -> None:
    headers, match_id, me, expected_total = await _scored_round(client, login, make_player, clock)

    standings = (await client.get("/fantasy/standings", headers=headers)).json()["data"]

    assert expected_total > 0
    assert standings["rounds"] == [
        {"match_id": match_id, "opponent": "Rival FS", "held_on": MATCH_DAY, "status": "scored"}
    ]
    assert standings["rows"] == [
        {
            "participant_id": me["me"]["participant_id"],
            "display_name": "head_coach",
            "total": expected_total,
            "points_by_round": {match_id: expected_total},
        }
    ]


async def test_round_detail_lists_my_five_slots(
    client: AsyncClient, login: Login, make_player: MakePlayer, clock: Clock
) -> None:
    headers, match_id, me, expected_total = await _scored_round(client, login, make_player, clock)

    response = await client.get(f"/fantasy/rounds/{match_id}/me", headers=headers)

    data = response.json()["data"]
    assert response.status_code == 200
    assert data["match_id"] == match_id
    assert data["status"] == "scored"
    assert data["total"] == expected_total
    assert [s["slot"] for s in data["slots"]] == ["goalkeeper"] + ["field"] * 4
    goalkeeper_slot = data["slots"][0]
    assert goalkeeper_slot == {
        "slot": "goalkeeper",
        "copy_id": None,
        "player_id": None,
        "name": None,
        "rating": None,
        "goals": 0,
        "points": 0,
        "captain": False,
    }
    filled = data["slots"][1:3]
    assert [s["copy_id"] for s in filled] == [c["copy_id"] for c in me["squad"]]
    assert all(s["rating"] is not None and s["name"] for s in filled)
    assert sum(s["points"] for s in data["slots"]) == expected_total


async def test_a_lineup_saved_after_the_lock_does_not_change_the_round(
    client: AsyncClient, login: Login, make_player: MakePlayer, clock: Clock
) -> None:
    players = await _field_players(make_player)
    headers = await login()
    await _create_league(client, headers)
    squad = (await _me(client, headers))["squad"]
    clock.now = BEFORE_LOCK
    await _put_lineup(client, headers, field=[c["copy_id"] for c in squad])
    clock.now = AFTER_LOCK
    await _put_lineup(client, headers)  # vacía, ya para la jornada siguiente
    match_id, _ = await played_match(client, headers, make_player, players=players)
    clock.now = AFTER_MATCH

    detail = (await client.get(f"/fantasy/rounds/{match_id}/me", headers=headers)).json()["data"]

    assert [s["copy_id"] for s in detail["slots"][1:3]] == [c["copy_id"] for c in squad]
    assert (await _me(client, headers))["lineup"]["field_copy_ids"] == [None] * 4


async def test_a_lineup_saved_after_the_lock_is_for_the_next_round(
    client: AsyncClient, login: Login, make_player: MakePlayer, clock: Clock
) -> None:
    players = await _field_players(make_player)
    headers = await login()
    await _create_league(client, headers)
    squad = (await _me(client, headers))["squad"]
    clock.now = AFTER_LOCK
    await _put_lineup(client, headers, field=[c["copy_id"] for c in squad])
    match_id, _ = await played_match(client, headers, make_player, players=players)
    clock.now = AFTER_MATCH

    standings = (await client.get("/fantasy/standings", headers=headers)).json()["data"]

    assert standings["rows"][0]["total"] == 0
    assert standings["rows"][0]["points_by_round"] == {match_id: 0}


async def test_a_locked_round_of_an_open_match_is_pending(
    client: AsyncClient, login: Login, make_player: MakePlayer, clock: Clock
) -> None:
    players = await _field_players(make_player)
    headers = await login()
    await _create_league(client, headers)
    match_id, _ = await played_match(client, headers, make_player, players=players, finalize=False)
    next_id = await _new_match(client, headers, "2026-10-24")
    await _new_match(client, headers, "2026-10-31")
    clock.now = AFTER_MATCH

    standings = (await client.get("/fantasy/standings", headers=headers)).json()["data"]
    detail = (await client.get(f"/fantasy/rounds/{match_id}/me", headers=headers)).json()["data"]

    assert [(r["match_id"], r["status"]) for r in standings["rounds"]] == [
        (match_id, "pending"),
        (next_id, "pending"),
    ]
    assert standings["rows"][0]["total"] == 0
    assert standings["rows"][0]["points_by_round"] == {}
    assert detail["status"] == "pending" and detail["total"] == 0


async def test_rows_are_ranked_by_total(
    client: AsyncClient, login: Login, make_player: MakePlayer, clock: Clock
) -> None:
    players = await _field_players(make_player)
    coach = await login()
    assistant = await login(Role.ASSISTANT_COACH)
    await _create_league(client, coach)
    squad = (await _me(client, assistant))["squad"]
    await _put_lineup(client, assistant, field=[c["copy_id"] for c in squad])
    await played_match(client, coach, make_player, players=players)
    clock.now = AFTER_MATCH

    rows = (await client.get("/fantasy/standings", headers=coach)).json()["data"]["rows"]

    assert [r["display_name"] for r in rows] == ["assistant_coach", "head_coach"]
    assert rows[0]["total"] > rows[1]["total"] == 0


async def test_a_friendly_is_not_a_round(
    client: AsyncClient, login: Login, make_player: MakePlayer, clock: Clock
) -> None:
    headers, match_id, _, _ = await _scored_round(client, login, make_player, clock)

    await client.patch(f"/matches/{match_id}", json={"is_official": False}, headers=headers)

    standings = (await client.get("/fantasy/standings", headers=headers)).json()["data"]
    detail = await client.get(f"/fantasy/rounds/{match_id}/me", headers=headers)
    assert standings["rounds"] == []
    assert standings["rows"][0]["total"] == 0
    assert detail.status_code == 404


async def test_a_match_before_the_league_is_not_a_round(client: AsyncClient, login: Login) -> None:
    headers = await login()
    await _create_league(client, headers)
    before = await _new_match(client, headers, "2026-10-03")

    response = await client.get(f"/fantasy/rounds/{before}/me", headers=headers)

    assert response.status_code == 404


async def test_without_league_standings_are_empty_and_rounds_404(
    client: AsyncClient, login: Login
) -> None:
    headers = await login()

    standings = await client.get("/fantasy/standings", headers=headers)
    detail = await client.get(f"/fantasy/rounds/{uuid.uuid4()}/me", headers=headers)

    assert standings.json()["data"] == {"rounds": [], "rows": []}
    assert detail.status_code == 404


async def test_players_use_the_fantasy(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    await _field_players(make_player)
    coach = await login()
    await _create_league(client, coach)
    player = await make_player(40, name="Dani")
    headers = await login(Role.PLAYER, player_id=player.id)
    squad = (await _me(client, headers))["squad"]

    lineup = await _put_lineup(client, headers, field=[squad[0]["copy_id"]])
    standings = await client.get("/fantasy/standings", headers=headers)

    assert lineup.status_code == 200
    assert standings.status_code == 200
