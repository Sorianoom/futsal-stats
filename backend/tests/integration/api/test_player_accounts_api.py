"""Cuentas de jugador: invitación del entrenador principal y alta con el token."""

import hashlib
import uuid
from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.invitations import INVITATION_TTL
from app.auth.rate_limit import INVITATION_MAX_FAILURES_PER_IP
from app.db.models import PlayerInvitation, RefreshSession, User
from app.domain.auth_sessions import RevokeReason
from app.domain.roles import Role
from tests.integration.api.conftest import PASSWORD, TEST_SETTINGS, Login, MakePlayer, MakeUser
from tests.integration.api.test_auth_api import instance

PLAYER_EMAIL = "jugador@club.es"


async def invite(client: AsyncClient, headers: dict[str, str], player_id: uuid.UUID):  # type: ignore[no-untyped-def]
    return await client.post(f"/players/{player_id}/invitation", headers=headers)


async def accept(  # type: ignore[no-untyped-def]
    client: AsyncClient, token: str, email: str = PLAYER_EMAIL, password: str = PASSWORD
):
    return await client.post(
        "/auth/invitations/accept", json={"token": token, "email": email, "password": password}
    )


async def invitation_token(
    client: AsyncClient, login: Login, make_player: MakePlayer, dorsal: int = 7
) -> tuple[str, uuid.UUID]:
    headers = await login(Role.HEAD_COACH, email=f"coach{dorsal}@club.es")
    player = await make_player(dorsal)
    response = await invite(client, headers, player.id)
    return response.json()["data"]["token"], player.id


async def test_head_coach_creates_an_invitation_that_expires_in_a_week(
    client: AsyncClient, login: Login, make_player: MakePlayer, session: AsyncSession
) -> None:
    headers = await login(Role.HEAD_COACH)
    player = await make_player(7)
    before = datetime.now(UTC)

    response = await invite(client, headers, player.id)

    data = response.json()["data"]
    expires_at = datetime.fromisoformat(data["expires_at"])
    assert response.status_code == 201
    assert len(data["token"]) >= 40
    assert before + INVITATION_TTL <= expires_at <= datetime.now(UTC) + INVITATION_TTL
    stored = (await session.execute(select(PlayerInvitation))).scalar_one()
    assert stored.token_hash == hashlib.sha256(data["token"].encode()).hexdigest()


async def test_only_the_head_coach_invites(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login(Role.ASSISTANT_COACH)
    player = await make_player(7)

    response = await invite(client, headers, player.id)

    assert response.status_code == 403


async def test_inviting_an_unknown_player_is_not_found(client: AsyncClient, login: Login) -> None:
    headers = await login(Role.HEAD_COACH)

    response = await invite(client, headers, uuid.uuid4())

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


async def test_a_new_invitation_invalidates_the_previous_unused_one(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login(Role.HEAD_COACH)
    player = await make_player(7)
    first = (await invite(client, headers, player.id)).json()["data"]["token"]
    second = (await invite(client, headers, player.id)).json()["data"]["token"]

    stale = await accept(client, first)
    fresh = await accept(client, second)

    assert stale.status_code == 400
    assert stale.json()["error"]["code"] == "invalid_invitation"
    assert fresh.status_code == 201


async def test_accepting_creates_a_player_account(
    client: AsyncClient, login: Login, make_player: MakePlayer, session: AsyncSession
) -> None:
    token, player_id = await invitation_token(client, login, make_player)

    response = await accept(client, token, email="  Jugador@Club.ES ")

    data = response.json()["data"]
    assert response.status_code == 201
    assert data["email"] == PLAYER_EMAIL
    assert data["role"] == "player"
    assert data["player_id"] == str(player_id)
    stored = (await session.execute(select(PlayerInvitation))).scalar_one()
    assert stored.used_at is not None


async def test_the_new_player_can_log_in_and_read_its_account(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    token, player_id = await invitation_token(client, login, make_player)
    await accept(client, token)

    logged = await client.post("/auth/login", json={"email": PLAYER_EMAIL, "password": PASSWORD})

    user = logged.json()["data"]["user"]
    assert logged.status_code == 200
    assert (user["role"], user["player_id"]) == ("player", str(player_id))


async def test_an_invitation_cannot_be_used_twice(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    token, _ = await invitation_token(client, login, make_player)
    await accept(client, token)

    again = await accept(client, token, email="otro@club.es")

    assert again.status_code == 400
    assert again.json()["error"]["code"] == "invalid_invitation"


async def test_unknown_used_and_expired_invitations_share_the_same_error(
    client: AsyncClient, login: Login, make_player: MakePlayer, session: AsyncSession
) -> None:
    used, _ = await invitation_token(client, login, make_player, dorsal=7)
    await accept(client, used)
    expired, _ = await invitation_token(client, login, make_player, dorsal=8)
    row = (
        await session.execute(
            select(PlayerInvitation).where(
                PlayerInvitation.token_hash == hashlib.sha256(expired.encode()).hexdigest()
            )
        )
    ).scalar_one()
    row.created_at = datetime.now(UTC) - INVITATION_TTL - timedelta(seconds=1)
    row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await session.flush()

    responses = [
        await accept(client, "no-existe", email="a@club.es"),
        await accept(client, used, email="b@club.es"),
        await accept(client, expired, email="c@club.es"),
    ]

    assert {r.status_code for r in responses} == {400}
    assert len({r.json()["error"]["message"] for r in responses}) == 1


async def test_accepting_with_a_taken_email_is_a_conflict(
    client: AsyncClient, login: Login, make_player: MakePlayer, make_user: MakeUser
) -> None:
    token, _ = await invitation_token(client, login, make_player)
    await make_user(email=PLAYER_EMAIL, role=Role.ASSISTANT_COACH)

    response = await accept(client, token)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "email_taken"


async def test_a_weak_password_is_rejected_and_keeps_the_invitation(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    token, _ = await invitation_token(client, login, make_player)

    weak = await accept(client, token, password="corta")
    strong = await accept(client, token)

    assert weak.status_code == 422
    assert weak.json()["error"]["code"] == "weak_password"
    assert strong.status_code == 201


async def test_accepting_validates_the_email(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    token, _ = await invitation_token(client, login, make_player)

    response = await accept(client, token, email="no-es-un-email")

    assert response.status_code == 422


async def test_accepting_from_a_foreign_origin_is_forbidden(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    token, _ = await invitation_token(client, login, make_player)

    response = await client.post(
        "/auth/invitations/accept",
        json={"token": token, "email": PLAYER_EMAIL, "password": PASSWORD},
        headers={"Origin": "https://evil.example"},
    )

    assert response.status_code == 403


async def test_inviting_a_player_with_an_account_is_a_conflict(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    token, player_id = await invitation_token(client, login, make_player)
    await accept(client, token)
    headers = await login(Role.HEAD_COACH, email="otro-coach@club.es")

    response = await invite(client, headers, player_id)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "already_has_account"


async def test_players_show_whether_they_have_an_active_account(
    client: AsyncClient, login: Login, make_player: MakePlayer, session: AsyncSession
) -> None:
    token, player_id = await invitation_token(client, login, make_player, dorsal=7)
    await make_player(8)
    await accept(client, token)
    headers = await login(Role.ASSISTANT_COACH)

    listing = await client.get("/players", headers=headers)
    detail = await client.get(f"/players/{player_id}", headers=headers)

    accounts = {p["dorsal"]: p["has_account"] for p in listing.json()["data"]}
    assert accounts == {7: True, 8: False}
    assert detail.json()["data"]["has_account"] is True
    user = (await session.execute(select(User).where(User.player_id == player_id))).scalar_one()
    user.is_active = False
    await session.flush()
    after = await client.get(f"/players/{player_id}", headers=headers)
    assert after.json()["data"]["has_account"] is False


async def test_a_deactivated_player_cannot_log_in(
    client: AsyncClient, login: Login, make_player: MakePlayer, session: AsyncSession
) -> None:
    token, player_id = await invitation_token(client, login, make_player)
    await accept(client, token)
    user = (await session.execute(select(User).where(User.player_id == player_id))).scalar_one()
    user.is_active = False
    await session.flush()

    response = await client.post("/auth/login", json={"email": PLAYER_EMAIL, "password": PASSWORD})

    assert response.status_code == 401


async def test_accepting_for_a_player_that_already_has_an_account_is_rejected(
    client: AsyncClient, login: Login, make_player: MakePlayer, make_user: MakeUser
) -> None:
    token, player_id = await invitation_token(client, login, make_player)
    await make_user(email="ya-tiene@club.es", role=Role.PLAYER, player_id=player_id)

    response = await accept(client, token)

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_invitation"


async def test_a_player_refreshes_and_logs_out(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    token, _ = await invitation_token(client, login, make_player)
    await accept(client, token)
    logged = await client.post("/auth/login", json={"email": PLAYER_EMAIL, "password": PASSWORD})
    client.cookies.set(
        "refresh_token", logged.cookies["refresh_token"], domain="test.local", path="/auth"
    )

    refreshed = await client.post("/auth/refresh")
    logged_out = await client.post("/auth/logout")

    assert refreshed.status_code == 200
    assert logged_out.status_code == 200


# --- Límite de intentos al aceptar invitaciones ---


async def fail_invitations(client: AsyncClient, times: int, ip: str | None = None) -> None:
    headers = {"x-real-ip": ip} if ip else {}
    for index in range(times):
        response = await client.post(
            "/auth/invitations/accept",
            json={"token": f"inventado-{index}", "email": PLAYER_EMAIL, "password": PASSWORD},
            headers=headers,
        )
        assert response.status_code == 400


async def test_too_many_invalid_invitations_block_even_a_valid_token(
    client: AsyncClient, login: Login, make_player: MakePlayer, session: AsyncSession
) -> None:
    token, _ = await invitation_token(client, login, make_player)
    await fail_invitations(client, INVITATION_MAX_FAILURES_PER_IP)

    response = await accept(client, token)

    assert response.status_code == 429
    assert "retry-after" in response.headers
    assert response.json()["error"]["code"] == "too_many_attempts"
    stored = (await session.execute(select(PlayerInvitation))).scalar_one()
    assert stored.used_at is None


async def test_fewer_invalid_invitations_than_the_limit_do_not_block(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    token, _ = await invitation_token(client, login, make_player)
    await fail_invitations(client, INVITATION_MAX_FAILURES_PER_IP - 1)

    response = await accept(client, token)

    assert response.status_code == 201


async def test_invalid_invitations_do_not_count_as_login_failures(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    token, _ = await invitation_token(client, login, make_player)
    await accept(client, token)
    await fail_invitations(client, INVITATION_MAX_FAILURES_PER_IP)

    response = await client.post("/auth/login", json={"email": PLAYER_EMAIL, "password": PASSWORD})

    assert response.status_code == 200


async def test_behind_vercel_invitation_failures_are_counted_per_real_ip(
    session: AsyncSession, login: Login, make_player: MakePlayer, client: AsyncClient
) -> None:
    token, _ = await invitation_token(client, login, make_player)
    vercel = TEST_SETTINGS.model_copy(update={"vercel": True})
    async with instance(session, vercel) as proxied:
        await fail_invitations(proxied, INVITATION_MAX_FAILURES_PER_IP, ip="81.0.0.1")
        body = {"token": token, "email": PLAYER_EMAIL, "password": PASSWORD}

        blocked = await proxied.post(
            "/auth/invitations/accept", json=body, headers={"x-real-ip": "81.0.0.1"}
        )
        allowed = await proxied.post(
            "/auth/invitations/accept", json=body, headers={"x-real-ip": "81.0.0.2"}
        )

    assert blocked.status_code == 429
    assert allowed.status_code == 201


# --- Baja del jugador ---


async def player_account(
    client: AsyncClient, login: Login, make_player: MakePlayer, session: AsyncSession
) -> tuple[uuid.UUID, User, dict[str, str], str]:
    """Jugador con cuenta y sesión abierta: (id del jugador, usuario, cabeceras, refresco)."""
    token, player_id = await invitation_token(client, login, make_player)
    await accept(client, token)
    logged = await client.post("/auth/login", json={"email": PLAYER_EMAIL, "password": PASSWORD})
    access = logged.json()["data"]["access_token"]
    user = (await session.execute(select(User).where(User.player_id == player_id))).scalar_one()
    return player_id, user, {"Authorization": f"Bearer {access}"}, logged.cookies["refresh_token"]


async def test_deactivating_a_player_closes_its_account_and_sessions(
    client: AsyncClient, login: Login, make_player: MakePlayer, session: AsyncSession
) -> None:
    player_id, user, player_headers, refresh = await player_account(
        client, login, make_player, session
    )
    coach = await login(Role.HEAD_COACH, email="baja-coach@club.es")

    response = await client.delete(f"/players/{player_id}", headers=coach)

    assert response.status_code == 200
    await session.refresh(user)
    assert user.is_active is False
    sessions = (
        (await session.execute(select(RefreshSession).where(RefreshSession.user_id == user.id)))
        .scalars()
        .all()
    )
    assert sessions and all(s.revoke_reason == RevokeReason.ADMIN for s in sessions)
    assert (await client.get("/auth/me", headers=player_headers)).status_code == 401
    client.cookies.set("refresh_token", refresh, domain="test.local", path="/auth")
    assert (await client.post("/auth/refresh")).status_code == 401


async def test_deactivating_a_player_without_account_still_works(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login(Role.HEAD_COACH)
    player = await make_player(7)

    response = await client.delete(f"/players/{player.id}", headers=headers)

    assert response.status_code == 200
    assert response.json()["data"]["is_active"] is False


async def test_inviting_an_inactive_player_is_a_conflict(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    headers = await login(Role.HEAD_COACH)
    player = await make_player(7)
    await client.delete(f"/players/{player.id}", headers=headers)

    response = await invite(client, headers, player.id)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "player_inactive"


async def test_a_pending_invitation_dies_with_the_deactivation(
    client: AsyncClient, login: Login, make_player: MakePlayer
) -> None:
    token, player_id = await invitation_token(client, login, make_player)
    headers = await login(Role.HEAD_COACH, email="baja-coach@club.es")
    await client.delete(f"/players/{player_id}", headers=headers)

    response = await accept(client, token)

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_invitation"
