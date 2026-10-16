import pytest
from httpx import AsyncClient

from app.auth.tokens import TokenType, create_token
from app.domain.roles import Role
from tests.integration.api.conftest import PASSWORD, TEST_SETTINGS, Login, MakeUser

EMAIL = "coach@club.es"


async def refresh_with(client: AsyncClient, token: str):  # type: ignore[no-untyped-def]
    client.cookies.set("refresh_token", token, domain="test.local", path="/auth")
    return await client.post("/auth/refresh")


async def do_login(client: AsyncClient, email: str = EMAIL, password: str = PASSWORD):  # type: ignore[no-untyped-def]
    return await client.post("/auth/login", json={"email": email, "password": password})


async def test_login_returns_an_access_token_and_the_user(
    client: AsyncClient, make_user: MakeUser
) -> None:
    await make_user(EMAIL, Role.HEAD_COACH)

    response = await do_login(client)

    body = response.json()
    assert response.status_code == 200
    assert body["success"] is True
    assert body["error"] is None
    assert body["data"]["token_type"] == "bearer"
    assert body["data"]["user"]["role"] == "head_coach"
    assert body["data"]["user"]["email"] == EMAIL


async def test_login_never_exposes_the_password_hash(
    client: AsyncClient, make_user: MakeUser
) -> None:
    await make_user(EMAIL)

    response = await do_login(client)

    assert "password" not in response.text.lower().replace('"token_type"', "")


async def test_login_sets_a_http_only_refresh_cookie(
    client: AsyncClient, make_user: MakeUser
) -> None:
    await make_user(EMAIL)

    response = await do_login(client)

    cookie = response.headers["set-cookie"].lower()
    assert "refresh_token=" in cookie
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert "path=/auth" in cookie


async def test_login_is_case_insensitive_on_email(client: AsyncClient, make_user: MakeUser) -> None:
    await make_user(EMAIL)

    response = await do_login(client, email="COACH@Club.es")

    assert response.status_code == 200


async def test_wrong_password_and_unknown_user_look_the_same(
    client: AsyncClient, make_user: MakeUser
) -> None:
    await make_user(EMAIL)

    wrong_password = await do_login(client, password="nope-nope-nope")
    unknown_user = await do_login(client, email="ghost@club.es")

    assert wrong_password.status_code == unknown_user.status_code == 401
    assert wrong_password.json() == unknown_user.json()
    assert wrong_password.json()["error"]["code"] == "invalid_credentials"


async def test_inactive_user_cannot_log_in(client: AsyncClient, make_user: MakeUser) -> None:
    await make_user(EMAIL, active=False)

    response = await do_login(client)

    assert response.status_code == 401


async def test_login_with_invalid_email_is_a_validation_error(client: AsyncClient) -> None:
    response = await do_login(client, email="not-an-email")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert response.json()["data"] is None


async def test_too_many_failures_block_even_the_right_password(
    client: AsyncClient, make_user: MakeUser
) -> None:
    await make_user(EMAIL)
    for _ in range(5):
        await do_login(client, password="wrong-wrong-wrong")

    response = await do_login(client)

    assert response.status_code == 429
    assert "retry-after" in response.headers
    assert response.json()["error"]["code"] == "too_many_attempts"


async def test_a_successful_login_resets_the_failure_count(
    client: AsyncClient, make_user: MakeUser
) -> None:
    await make_user(EMAIL)
    for _ in range(4):
        await do_login(client, password="wrong-wrong-wrong")
    await do_login(client)
    for _ in range(4):
        await do_login(client, password="wrong-wrong-wrong")

    response = await do_login(client)

    assert response.status_code == 200


async def test_me_returns_the_current_user(client: AsyncClient, login: Login) -> None:
    headers = await login(Role.ASSISTANT_COACH)

    response = await client.get("/auth/me", headers=headers)

    assert response.status_code == 200
    assert response.json()["data"]["role"] == "assistant_coach"


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Bearer garbage"},
        {"Authorization": "Basic abc"},
        {"Authorization": "Bearer"},
    ],
)
async def test_me_rejects_missing_or_malformed_credentials(
    client: AsyncClient, headers: dict[str, str]
) -> None:
    response = await client.get("/auth/me", headers=headers)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


async def test_refresh_token_is_not_accepted_as_a_bearer(
    client: AsyncClient, make_user: MakeUser
) -> None:
    user = await make_user(EMAIL)
    refresh = create_token(user.id, user.role, TokenType.REFRESH, TEST_SETTINGS)

    response = await client.get("/auth/me", headers={"Authorization": f"Bearer {refresh}"})

    assert response.status_code == 401


async def test_deactivated_user_loses_access_immediately(
    client: AsyncClient, make_user: MakeUser, login: Login
) -> None:
    headers = await login(Role.HEAD_COACH, EMAIL)
    user = await make_user("other@club.es")
    other = create_token(user.id, user.role, TokenType.ACCESS, TEST_SETTINGS)
    user.is_active = False

    response = await client.get("/auth/me", headers={"Authorization": f"Bearer {other}"})

    assert (await client.get("/auth/me", headers=headers)).status_code == 200
    assert response.status_code == 401


async def test_refresh_issues_a_new_access_token(client: AsyncClient, make_user: MakeUser) -> None:
    await make_user(EMAIL)
    login_response = await do_login(client)
    refresh_cookie = login_response.cookies["refresh_token"]

    response = await refresh_with(client, refresh_cookie)

    assert response.status_code == 200
    new_token = response.json()["data"]["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {new_token}"})
    assert me.status_code == 200


async def test_refresh_without_cookie_is_unauthorized(client: AsyncClient) -> None:
    response = await client.post("/auth/refresh")

    assert response.status_code == 401


async def test_access_token_in_the_refresh_cookie_is_rejected(
    client: AsyncClient, make_user: MakeUser
) -> None:
    user = await make_user(EMAIL)
    access = create_token(user.id, user.role, TokenType.ACCESS, TEST_SETTINGS)
    refresh = create_token(user.id, user.role, TokenType.REFRESH, TEST_SETTINGS)
    assert (await refresh_with(client, refresh)).status_code == 200  # la cookie sí se envía

    response = await refresh_with(client, access)

    assert response.status_code == 401


async def test_refresh_fails_after_the_user_is_deactivated(
    client: AsyncClient, make_user: MakeUser
) -> None:
    user = await make_user(EMAIL)
    refresh = create_token(user.id, user.role, TokenType.REFRESH, TEST_SETTINGS)
    assert (await refresh_with(client, refresh)).status_code == 200  # control: antes sí funciona
    user.is_active = False

    response = await refresh_with(client, refresh)

    assert response.status_code == 401


async def test_logout_expires_the_refresh_cookie(client: AsyncClient) -> None:
    response = await client.post("/auth/logout")

    cookie = response.headers["set-cookie"].lower()
    assert response.status_code == 200
    assert "refresh_token=" in cookie
    assert "max-age=0" in cookie


async def test_refresh_from_a_foreign_origin_is_forbidden(
    client: AsyncClient, make_user: MakeUser
) -> None:
    user = await make_user(EMAIL)
    refresh = create_token(user.id, user.role, TokenType.REFRESH, TEST_SETTINGS)
    client.cookies.set("refresh_token", refresh, domain="test.local", path="/auth")

    response = await client.post("/auth/refresh", headers={"Origin": "https://evil.club.es"})

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


async def test_logout_from_a_foreign_origin_is_forbidden(client: AsyncClient) -> None:
    response = await client.post("/auth/logout", headers={"Origin": "https://evil.club.es"})

    assert response.status_code == 403


async def test_refresh_from_the_allowed_origin_works(
    client: AsyncClient, make_user: MakeUser
) -> None:
    user = await make_user(EMAIL)
    refresh = create_token(user.id, user.role, TokenType.REFRESH, TEST_SETTINGS)
    client.cookies.set("refresh_token", refresh, domain="test.local", path="/auth")

    response = await client.post("/auth/refresh", headers={"Origin": "http://localhost:3000"})

    assert response.status_code == 200


async def test_rotating_emails_from_one_ip_is_eventually_blocked(client: AsyncClient) -> None:
    for index in range(30):
        await do_login(client, email=f"ghost{index}@club.es", password="whatever-pass")

    response = await do_login(client, email="brand-new@club.es", password="whatever-pass")

    assert response.status_code == 429


async def test_old_password_hashes_are_upgraded_on_login(
    client: AsyncClient, make_user: MakeUser
) -> None:
    from argon2 import PasswordHasher

    user = await make_user(EMAIL)
    user.password_hash = PasswordHasher(time_cost=1, memory_cost=8, parallelism=1).hash(PASSWORD)
    stale = user.password_hash

    response = await do_login(client)

    assert response.status_code == 200
    assert user.password_hash != stale
    assert (await do_login(client)).status_code == 200
