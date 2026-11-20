"""Fixtures de API: app real con la sesión de pruebas (transacción revertida) inyectada."""

import uuid
from collections.abc import AsyncIterator, Awaitable, Callable

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db.catalog_repo import seed_catalog
from app.db.models import Player, User
from app.db.session import get_session
from app.db.users_repo import create_user
from app.domain.points.callup import PlayerStatus, Position
from app.domain.roles import Role
from app.main import create_app

PASSWORD = "S3cret-pass-word!"
TEST_SETTINGS = Settings(
    _env_file=None,
    jwt_secret="Zx9-Qm4_Lp7vWc2Rt8Ys5Uh3Nj6Bk1Dg0Fa",  # type: ignore[arg-type]
    cookie_secure=False,
)

MakeUser = Callable[..., Awaitable[User]]
Login = Callable[..., Awaitable[dict[str, str]]]
MakePlayer = Callable[..., Awaitable[Player]]


@pytest.fixture
async def client(session: AsyncSession) -> AsyncIterator[AsyncClient]:
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[get_settings] = lambda: TEST_SETTINGS
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        yield http


@pytest.fixture
def make_user(session: AsyncSession) -> MakeUser:
    async def _make(
        email: str = "coach@club.es",
        role: Role = Role.HEAD_COACH,
        active: bool = True,
        password: str = PASSWORD,
        player_id: uuid.UUID | None = None,
    ) -> User:
        user = await create_user(session, email, password, role, player_id=player_id)
        user.is_active = active
        await session.flush()
        return user

    return _make


@pytest.fixture
def login(client: AsyncClient, make_user: MakeUser) -> Login:
    async def _login(
        role: Role = Role.HEAD_COACH,
        email: str | None = None,
        player_id: uuid.UUID | None = None,
    ) -> dict[str, str]:
        address = email or f"{role.value}@club.es"
        await make_user(email=address, role=role, player_id=player_id)
        response = await client.post("/auth/login", json={"email": address, "password": PASSWORD})
        token = response.json()["data"]["access_token"]
        return {"Authorization": f"Bearer {token}"}

    return _login


@pytest.fixture
def make_player(session: AsyncSession) -> MakePlayer:
    async def _make(
        dorsal: int,
        position: Position = Position.FIELD,
        status: PlayerStatus = PlayerStatus.AVAILABLE,
        name: str | None = None,
    ) -> Player:
        player = Player(
            name=name or f"Jugador {dorsal}", dorsal=dorsal, position=position, status=status
        )
        session.add(player)
        await session.flush()
        return player

    return _make


@pytest.fixture(autouse=True)
async def seeded_catalog(session: AsyncSession) -> None:
    await seed_catalog(session)


PLAYER_ACCOUNT_DORSAL = 99


@pytest.fixture
async def player_headers(login: Login, make_player: MakePlayer) -> dict[str, str]:
    """Cabeceras de un usuario con rol `player` vinculado a un jugador (dorsal 99)."""
    player = await make_player(PLAYER_ACCOUNT_DORSAL)
    return await login(Role.PLAYER, player_id=player.id)


Join = Callable[..., Awaitable[dict[str, str]]]
# Dorsales de las fichas de quienes juegan al Fantasy en los tests: lejos de los de la plantilla.
_JOIN_FIRST_DORSAL = 70


@pytest.fixture
def join(login: Login, session: AsyncSession) -> Join:
    """Cabeceras de alguien que juega al Fantasy con la plantilla pública y sin copias propias.

    Las cuentas de partidos del cuerpo técnico no juegan y las del Fantasy del cuerpo técnico son
    privadas: se usa una cuenta de jugador vinculada a una ficha de baja (sin copias en la liga) y
    con `name` como nombre, que es el que sale en el Fantasy.
    """
    dorsals = iter(range(_JOIN_FIRST_DORSAL, PLAYER_ACCOUNT_DORSAL))

    async def _join(name: str = "head_coach") -> dict[str, str]:
        player = Player(name=name, dorsal=next(dorsals), position=Position.FIELD, is_active=False)
        session.add(player)
        await session.flush()
        return await login(Role.PLAYER, email=f"{name}.juega@club.es", player_id=player.id)

    return _join


@pytest.fixture
async def staff(login: Login) -> dict[str, str]:
    """Cabeceras del entrenador principal (crea la liga y los partidos; en el Fantasy solo mira)."""
    return await login()
