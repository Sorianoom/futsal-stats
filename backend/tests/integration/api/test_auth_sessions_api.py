"""Las sesiones de refresco desde la API: rotación del jti, gracia, revocación y adopción."""

import uuid
from datetime import UTC, datetime, timedelta

import jwt
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.tokens import TokenType, create_token
from app.db.models import RefreshSession
from app.domain.auth_sessions import RevokeReason
from app.domain.roles import Role
from tests.integration.api.conftest import PASSWORD, TEST_SETTINGS, MakeUser

EMAIL = "coach@club.es"
GRACE = TEST_SETTINGS.refresh_reuse_grace_seconds


def jti_of(token: str) -> uuid.UUID:
    return uuid.UUID(jwt.decode(token, options={"verify_signature": False})["jti"])


def cookie_of(response: Response) -> str:
    return response.cookies["refresh_token"]


async def refresh_with(client: AsyncClient, token: str) -> Response:
    client.cookies.set("refresh_token", token, domain="test.local", path="/auth")
    return await client.post("/auth/refresh")


async def logout_with(client: AsyncClient, token: str) -> Response:
    client.cookies.set("refresh_token", token, domain="test.local", path="/auth")
    return await client.post("/auth/logout")


async def login(client: AsyncClient, make_user: MakeUser) -> Response:
    await make_user(EMAIL)
    return await client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})


async def only_session(db: AsyncSession) -> RefreshSession:
    return (await db.execute(select(RefreshSession))).scalar_one()


async def test_login_opens_a_session_and_the_cookie_carries_its_jti(
    client: AsyncClient, make_user: MakeUser, session: AsyncSession
) -> None:
    response = await login(client, make_user)

    row = await only_session(session)
    assert jti_of(cookie_of(response)) == row.current_jti
    assert row.absolute_expires_at - row.created_at == timedelta(
        days=TEST_SETTINGS.refresh_session_max_days
    )


async def test_refresh_rotates_the_jti(
    client: AsyncClient, make_user: MakeUser, session: AsyncSession
) -> None:
    first = cookie_of(await login(client, make_user))

    response = await refresh_with(client, first)

    row = await only_session(session)
    assert response.status_code == 200
    assert jti_of(cookie_of(response)) == row.current_jti != jti_of(first)
    assert row.previous_jti == jti_of(first)


async def test_the_previous_cookie_still_works_within_the_grace(
    client: AsyncClient, make_user: MakeUser
) -> None:
    first = cookie_of(await login(client, make_user))
    rotated = await refresh_with(client, first)

    retry = await refresh_with(client, first)

    assert retry.status_code == 200
    assert jti_of(cookie_of(retry)) == jti_of(cookie_of(rotated))


async def test_the_previous_cookie_after_the_grace_revokes_the_session(
    client: AsyncClient, make_user: MakeUser, session: AsyncSession
) -> None:
    first = cookie_of(await login(client, make_user))
    rotated = await refresh_with(client, first)
    row = await only_session(session)
    row.rotated_at = datetime.now(UTC) - timedelta(seconds=GRACE + 60)
    await session.flush()

    late = await refresh_with(client, first)

    assert late.status_code == 401
    assert row.revoke_reason is RevokeReason.REUSE
    assert (await refresh_with(client, cookie_of(rotated))).status_code == 401


async def test_logout_revokes_the_session(
    client: AsyncClient, make_user: MakeUser, session: AsyncSession
) -> None:
    cookie = cookie_of(await login(client, make_user))

    response = await logout_with(client, cookie)

    assert response.status_code == 200
    assert (await only_session(session)).revoke_reason is RevokeReason.LOGOUT
    assert (await refresh_with(client, cookie)).status_code == 401


async def test_logout_with_a_garbage_cookie_still_closes_the_browser_side(
    client: AsyncClient,
) -> None:
    response = await logout_with(client, "no-es-un-jwt")

    assert response.status_code == 200
    assert "max-age=0" in response.headers["set-cookie"].lower()


async def test_an_unknown_jti_is_rejected(client: AsyncClient, make_user: MakeUser) -> None:
    user = await make_user(EMAIL)
    forged = create_token(user.id, user.role, TokenType.REFRESH, TEST_SETTINGS, jti=uuid.uuid4())

    assert (await refresh_with(client, forged)).status_code == 401


async def test_a_session_past_its_absolute_limit_cannot_refresh(
    client: AsyncClient, make_user: MakeUser, session: AsyncSession
) -> None:
    cookie = cookie_of(await login(client, make_user))
    row = await only_session(session)
    row.created_at = datetime.now(UTC) - timedelta(days=40)
    row.absolute_expires_at = datetime.now(UTC) - timedelta(days=1)
    await session.flush()

    assert (await refresh_with(client, cookie)).status_code == 401


async def test_the_cookie_never_outlives_the_absolute_limit(
    client: AsyncClient, make_user: MakeUser, session: AsyncSession
) -> None:
    cookie = cookie_of(await login(client, make_user))
    row = await only_session(session)
    row.absolute_expires_at = datetime.now(UTC) + timedelta(hours=1)
    await session.flush()

    response = await refresh_with(client, cookie)

    max_age = int(response.headers["set-cookie"].lower().split("max-age=")[1].split(";")[0])
    assert 0 < max_age <= 3600
    exp = jwt.decode(cookie_of(response), options={"verify_signature": False})["exp"]
    assert exp <= int((datetime.now(UTC) + timedelta(hours=1)).timestamp())


async def test_a_legacy_refresh_token_is_adopted_into_a_session(
    client: AsyncClient, make_user: MakeUser, session: AsyncSession
) -> None:
    user = await make_user(EMAIL)
    legacy = create_token(user.id, user.role, TokenType.REFRESH, TEST_SETTINGS)

    response = await refresh_with(client, legacy)

    row = await only_session(session)
    assert response.status_code == 200
    assert jti_of(cookie_of(response)) == row.current_jti
    assert row.legacy_token_hash is not None


async def test_a_legacy_token_replayed_within_the_grace_still_works(
    client: AsyncClient, make_user: MakeUser
) -> None:
    user = await make_user(EMAIL)
    legacy = create_token(user.id, user.role, TokenType.REFRESH, TEST_SETTINGS)
    first = await refresh_with(client, legacy)

    replay = await refresh_with(client, legacy)

    assert replay.status_code == 200
    assert jti_of(cookie_of(replay)) == jti_of(cookie_of(first))


async def test_a_legacy_token_replayed_after_the_grace_revokes_the_session(
    client: AsyncClient, make_user: MakeUser, session: AsyncSession
) -> None:
    user = await make_user(EMAIL)
    legacy = create_token(user.id, user.role, TokenType.REFRESH, TEST_SETTINGS)
    await refresh_with(client, legacy)
    row = await only_session(session)
    row.created_at = datetime.now(UTC) - timedelta(seconds=GRACE + 60)
    row.absolute_expires_at = datetime.now(UTC) + timedelta(days=1)
    await session.flush()

    replay = await refresh_with(client, legacy)

    assert replay.status_code == 401
    assert row.revoke_reason is RevokeReason.REUSE


async def test_a_deactivated_user_cannot_use_an_open_session(
    client: AsyncClient, make_user: MakeUser, session: AsyncSession
) -> None:
    user = await make_user(EMAIL)
    response = await client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    user.is_active = False
    await session.flush()

    assert (await refresh_with(client, cookie_of(response))).status_code == 401


async def test_a_legacy_token_of_a_user_that_no_longer_exists_is_unauthorized(
    client: AsyncClient,
) -> None:
    ghost = create_token(uuid.uuid4(), Role.HEAD_COACH, TokenType.REFRESH, TEST_SETTINGS)

    assert (await refresh_with(client, ghost)).status_code == 401
