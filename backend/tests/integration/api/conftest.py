"""Fixtures de API: app real con la sesión de pruebas (transacción revertida) inyectada."""

from collections.abc import AsyncIterator, Awaitable, Callable

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db.models import User
from app.db.session import get_session
from app.db.users_repo import create_user
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
    ) -> User:
        user = await create_user(session, email, password, role)
        user.is_active = active
        await session.flush()
        return user

    return _make


@pytest.fixture
def login(client: AsyncClient, make_user: MakeUser) -> Login:
    async def _login(role: Role = Role.HEAD_COACH, email: str | None = None) -> dict[str, str]:
        address = email or f"{role.value}@club.es"
        await make_user(email=address, role=role)
        response = await client.post("/auth/login", json={"email": address, "password": PASSWORD})
        token = response.json()["data"]["access_token"]
        return {"Authorization": f"Bearer {token}"}

    return _login
