import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import refresh_sessions_repo as repo
from app.db.models import RefreshSession, User
from app.domain.auth_sessions import RevokeReason
from app.domain.roles import Role

GRACE = 7200
MAX_DAYS = 30
NOW = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)


async def make_user(db: AsyncSession) -> User:
    user = User(email=f"{uuid.uuid4()}@club.es", password_hash="x", role=Role.HEAD_COACH)
    db.add(user)
    await db.flush()
    return user


async def start(db: AsyncSession, **kwargs: object) -> RefreshSession:
    user = await make_user(db)
    return await repo.create_session(db, user.id, NOW, MAX_DAYS, **kwargs)  # type: ignore[arg-type]


async def test_a_new_session_expires_at_the_absolute_limit(session: AsyncSession) -> None:
    created = await start(session)

    assert created.absolute_expires_at == NOW + timedelta(days=MAX_DAYS)
    assert created.previous_jti is None


async def test_rotating_the_current_jti_issues_a_new_one(session: AsyncSession) -> None:
    created = await start(session)
    first = created.current_jti

    rotation = await repo.rotate(session, first, NOW + timedelta(hours=1), GRACE)

    assert rotation is not None
    assert rotation.jti != first
    assert (created.previous_jti, created.current_jti) == (first, rotation.jti)
    assert created.last_used_at == NOW + timedelta(hours=1)


async def test_the_previous_jti_is_accepted_within_the_grace_window(session: AsyncSession) -> None:
    created = await start(session)
    first = created.current_jti
    rotated = await repo.rotate(session, first, NOW, GRACE)
    assert rotated is not None

    retry = await repo.rotate(session, first, NOW + timedelta(seconds=GRACE - 1), GRACE)

    assert retry is not None
    assert retry.jti == rotated.jti  # reenvía el vigente: el cliente nunca recibió la respuesta
    assert created.revoked_at is None


async def test_the_previous_jti_after_the_grace_window_revokes_the_session(
    session: AsyncSession,
) -> None:
    created = await start(session)
    first = created.current_jti
    await repo.rotate(session, first, NOW, GRACE)

    late = await repo.rotate(session, first, NOW + timedelta(seconds=GRACE + 1), GRACE)

    assert late is None
    assert created.revoke_reason is RevokeReason.REUSE


async def test_a_revoked_session_is_never_rotated_again(session: AsyncSession) -> None:
    created = await start(session)
    jti = created.current_jti
    await repo.revoke(session, jti, RevokeReason.LOGOUT, NOW)

    assert await repo.rotate(session, jti, NOW, GRACE) is None
    assert created.revoke_reason is RevokeReason.LOGOUT


async def test_a_session_past_its_absolute_limit_is_not_rotated(session: AsyncSession) -> None:
    created = await start(session)

    after_cap = NOW + timedelta(days=MAX_DAYS, seconds=1)

    assert await repo.rotate(session, created.current_jti, after_cap, GRACE) is None


async def test_an_unknown_jti_is_not_rotated(session: AsyncSession) -> None:
    assert await repo.rotate(session, uuid.uuid4(), NOW, GRACE) is None


async def test_revoking_keeps_the_first_reason(session: AsyncSession) -> None:
    created = await start(session)
    jti = created.current_jti
    await repo.revoke(session, jti, RevokeReason.LOGOUT, NOW)

    await repo.revoke(session, jti, RevokeReason.ADMIN, NOW + timedelta(hours=1))

    assert (created.revoke_reason, created.revoked_at) == (RevokeReason.LOGOUT, NOW)


async def test_revoking_an_unknown_jti_does_nothing(session: AsyncSession) -> None:
    await repo.revoke(session, uuid.uuid4(), RevokeReason.LOGOUT, NOW)


async def test_the_previous_jti_can_also_close_the_session(session: AsyncSession) -> None:
    created = await start(session)
    first = created.current_jti
    await repo.rotate(session, first, NOW, GRACE)

    await repo.revoke(session, first, RevokeReason.LOGOUT, NOW)

    assert created.revoke_reason is RevokeReason.LOGOUT


async def test_adopting_a_legacy_token_creates_one_session_only_once(
    session: AsyncSession,
) -> None:
    user = await make_user(session)

    first = await repo.adopt_legacy(session, user.id, "a" * 64, NOW, MAX_DAYS)
    again = await repo.adopt_legacy(session, user.id, "a" * 64, NOW, MAX_DAYS)

    assert first is not None
    assert again is None


async def test_a_legacy_token_replayed_within_the_grace_returns_the_current_jti(
    session: AsyncSession,
) -> None:
    user = await make_user(session)
    adopted = await repo.adopt_legacy(session, user.id, "b" * 64, NOW, MAX_DAYS)
    assert adopted is not None

    replay = await repo.replay_legacy(session, "b" * 64, NOW + timedelta(seconds=GRACE), GRACE)

    assert replay is not None
    assert replay.jti == adopted.jti


async def test_a_legacy_token_replayed_after_the_grace_revokes_the_session(
    session: AsyncSession,
) -> None:
    user = await make_user(session)
    adopted = await repo.adopt_legacy(session, user.id, "c" * 64, NOW, MAX_DAYS)
    assert adopted is not None

    late = await repo.replay_legacy(session, "c" * 64, NOW + timedelta(seconds=GRACE + 1), GRACE)

    assert late is None
    assert adopted.session.revoke_reason is RevokeReason.REUSE


async def test_a_legacy_token_that_was_never_adopted_is_not_replayed(
    session: AsyncSession,
) -> None:
    assert await repo.replay_legacy(session, "d" * 64, NOW, GRACE) is None


async def test_a_revoked_session_does_not_accept_its_legacy_token(session: AsyncSession) -> None:
    user = await make_user(session)
    adopted = await repo.adopt_legacy(session, user.id, "e" * 64, NOW, MAX_DAYS)
    assert adopted is not None
    await repo.revoke(session, adopted.jti, RevokeReason.LOGOUT, NOW)

    assert await repo.replay_legacy(session, "e" * 64, NOW, GRACE) is None
