"""El rol `player` queda fuera por defecto: este test recorre TODAS las rutas de la app.

Si alguien añade una ruta y la abre a los jugadores (o se olvida de cerrarla), falla aquí.
Las rutas se sacan del esquema OpenAPI: desde FastAPI 0.143 `app.routes` guarda los routers
incluidos sin aplanar (`_IncludedRouter`, API privada), y el esquema es la lista pública de
todas las operaciones. Ninguna ruta de la app usa `include_in_schema=False`.
"""

import re
import uuid

import pytest
from httpx import AsyncClient

from app.config import get_settings
from app.domain.roles import Role
from app.main import create_app
from tests.integration.api.conftest import Login, MakePlayer

PREFIX = get_settings().api_prefix
PATH_PARAM = re.compile(r"\{[^}]+\}")

# Rutas que un jugador puede usar con su token: el resto debe responder 403.
PLAYER_ROUTES = {
    ("GET", "/auth/me"),
    ("GET", "/matches"),
    ("GET", "/matches/{match_id}/stats"),
    ("GET", "/stats/players"),
    # Fantasy: todo menos crear la liga (entrenador principal).
    ("GET", "/fantasy/me"),
    ("PUT", "/fantasy/lineup"),
    ("GET", "/fantasy/standings"),
    ("GET", "/fantasy/rounds/{match_id}/me"),
    ("GET", "/fantasy/market"),
    ("PUT", "/fantasy/market/{listing_id}/bid"),
    ("DELETE", "/fantasy/market/{listing_id}/bid"),
    ("POST", "/fantasy/copies/{copy_id}/listing"),
    ("DELETE", "/fantasy/copies/{copy_id}/listing"),
    ("POST", "/fantasy/copies/{copy_id}/sell"),
    ("GET", "/fantasy/transfers"),
    ("GET", "/fantasy/clauses"),
    ("POST", "/fantasy/copies/{copy_id}/clause/buy"),
    ("PUT", "/fantasy/copies/{copy_id}/clause"),
}
# Rutas sin autenticación por token: no miran el rol, así que tampoco dan 403.
PUBLIC_ROUTES = {
    ("POST", "/auth/login"),
    ("POST", "/auth/refresh"),
    ("POST", "/auth/logout"),
    ("POST", "/auth/invitations/accept"),
    ("GET", "/health"),
}
NOT_FORBIDDEN = {(method, f"{PREFIX}{path}") for method, path in PLAYER_ROUTES | PUBLIC_ROUTES}


def _every_route() -> list[tuple[str, str]]:
    paths = create_app().openapi()["paths"]
    return sorted(
        (method.upper(), path) for path, operations in paths.items() for method in operations
    )


EVERY_ROUTE = _every_route()


def test_the_sweep_sees_the_routes_open_to_players() -> None:
    assert NOT_FORBIDDEN <= set(EVERY_ROUTE)
    assert ("POST", f"{PREFIX}/players/{{player_id}}/invitation") in EVERY_ROUTE
    assert ("POST", f"{PREFIX}/fantasy/league") in EVERY_ROUTE


@pytest.mark.parametrize(("method", "path"), EVERY_ROUTE)
async def test_a_player_is_forbidden_everywhere_except_the_allowed_routes(
    client: AsyncClient, player_headers: dict[str, str], method: str, path: str
) -> None:
    url = PATH_PARAM.sub(str(uuid.uuid4()), path)
    headers = {**player_headers, "Idempotency-Key": str(uuid.uuid4())}

    response = await client.request(method, url, headers=headers, json={})

    if (method, path) in NOT_FORBIDDEN:
        assert response.status_code != 403
    else:
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "forbidden"


async def test_a_player_reads_its_own_account(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    player = await make_player(10)
    headers = await login(Role.PLAYER, email="jugador@club.es", player_id=player.id)

    response = await client.get("/auth/me", headers=headers)

    data = response.json()["data"]
    assert response.status_code == 200
    assert data["role"] == "player"
    assert data["player_id"] == str(player.id)


async def test_staff_accounts_have_no_linked_player(client: AsyncClient, login: Login) -> None:
    headers = await login(Role.ASSISTANT_COACH)

    response = await client.get("/auth/me", headers=headers)

    assert response.json()["data"]["player_id"] is None


async def test_a_player_reads_matches_and_season_stats(
    client: AsyncClient, player_headers: dict[str, str]
) -> None:
    matches = await client.get("/matches", headers=player_headers)
    season = await client.get("/stats/players", headers=player_headers)

    assert matches.status_code == 200
    assert season.status_code == 200


async def test_the_assistant_coach_keeps_access_to_staff_routes(
    client: AsyncClient, login: Login
) -> None:
    headers = await login(Role.ASSISTANT_COACH)

    response = await client.get("/players", headers=headers)

    assert response.status_code == 200
