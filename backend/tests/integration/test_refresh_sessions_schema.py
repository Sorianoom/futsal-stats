import uuid
from datetime import UTC, datetime, timedelta

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import delete, func, inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.db.models import Base, RefreshSession, User
from app.domain.auth_sessions import RevokeReason
from app.domain.roles import Role


def in_days(days: int) -> datetime:
    return datetime.now(UTC) + timedelta(days=days)


async def make_user(db: AsyncSession, email: str = "coach@club.es") -> User:
    user = User(email=email, password_hash="x", role=Role.HEAD_COACH)
    db.add(user)
    await db.flush()
    return user


def new_session(user: User, **overrides: object) -> RefreshSession:
    values: dict[str, object] = {
        "user_id": user.id,
        "current_jti": uuid.uuid4(),
        "absolute_expires_at": in_days(30),
    }
    return RefreshSession(**{**values, **overrides})


async def test_the_table_has_the_expected_columns(engine: AsyncEngine) -> None:
    async with engine.connect() as connection:
        columns = await connection.run_sync(
            lambda c: {col["name"] for col in inspect(c).get_columns("refresh_sessions")}
        )

    assert columns == {
        "id",
        "user_id",
        "current_jti",
        "previous_jti",
        "rotated_at",
        "created_at",
        "last_used_at",
        "absolute_expires_at",
        "revoked_at",
        "revoke_reason",
        "legacy_token_hash",
    }


async def test_the_model_and_the_migrations_agree_on_this_table(engine: AsyncEngine) -> None:
    def differences(connection) -> list[object]:  # type: ignore[no-untyped-def]
        context = MigrationContext.configure(connection)
        return [d for d in compare_metadata(context, Base.metadata) if "refresh_sessions" in str(d)]

    async with engine.connect() as connection:
        assert await connection.run_sync(differences) == []


async def test_a_new_session_is_active_and_timestamped_by_the_database(
    session: AsyncSession,
) -> None:
    user = await make_user(session)
    row = new_session(user)
    session.add(row)
    await session.flush()
    await session.refresh(row)

    assert row.created_at is not None
    assert row.last_used_at is not None
    assert (row.revoked_at, row.revoke_reason, row.previous_jti, row.rotated_at) == (
        None,
        None,
        None,
        None,
    )


async def test_a_session_must_expire_after_it_was_created(session: AsyncSession) -> None:
    user = await make_user(session)
    session.add(new_session(user, absolute_expires_at=in_days(-1)))

    with pytest.raises(IntegrityError, match="expires_after_creation"):
        await session.flush()


async def test_a_revocation_needs_its_reason(session: AsyncSession) -> None:
    user = await make_user(session)
    session.add(new_session(user, revoked_at=datetime.now(UTC)))

    with pytest.raises(IntegrityError, match="revocation_is_complete"):
        await session.flush()


async def test_a_reason_without_a_revocation_time_is_rejected(session: AsyncSession) -> None:
    user = await make_user(session)
    session.add(new_session(user, revoke_reason=RevokeReason.LOGOUT))

    with pytest.raises(IntegrityError, match="revocation_is_complete"):
        await session.flush()


async def test_a_complete_revocation_is_accepted(session: AsyncSession) -> None:
    user = await make_user(session)
    session.add(new_session(user, revoked_at=datetime.now(UTC), revoke_reason=RevokeReason.REUSE))

    await session.flush()


async def test_the_previous_jti_cannot_equal_the_current_one(session: AsyncSession) -> None:
    user = await make_user(session)
    same = uuid.uuid4()
    session.add(
        new_session(user, current_jti=same, previous_jti=same, rotated_at=datetime.now(UTC))
    )

    with pytest.raises(IntegrityError, match="previous_differs_from_current"):
        await session.flush()


async def test_the_previous_jti_and_the_rotation_time_go_together(session: AsyncSession) -> None:
    user = await make_user(session)
    session.add(new_session(user, previous_jti=uuid.uuid4()))

    with pytest.raises(IntegrityError, match="rotation_is_complete"):
        await session.flush()


async def test_a_rotated_session_is_accepted(session: AsyncSession) -> None:
    user = await make_user(session)
    session.add(new_session(user, previous_jti=uuid.uuid4(), rotated_at=datetime.now(UTC)))

    await session.flush()


async def test_a_legacy_token_can_only_be_adopted_once(session: AsyncSession) -> None:
    user = await make_user(session)
    session.add(new_session(user, legacy_token_hash="a" * 64))
    await session.flush()
    session.add(new_session(user, legacy_token_hash="a" * 64))

    with pytest.raises(IntegrityError, match="uq_refresh_sessions_legacy_token_hash"):
        await session.flush()


async def test_sessions_without_a_legacy_token_do_not_collide(session: AsyncSession) -> None:
    user = await make_user(session)
    session.add_all([new_session(user), new_session(user)])

    await session.flush()


async def test_a_session_needs_an_existing_user(session: AsyncSession) -> None:
    session.add(
        RefreshSession(
            user_id=uuid.uuid4(), current_jti=uuid.uuid4(), absolute_expires_at=in_days(30)
        )
    )

    with pytest.raises(IntegrityError, match="fk_refresh_sessions_user_id_users"):
        await session.flush()


async def test_deleting_a_user_removes_their_sessions(session: AsyncSession) -> None:
    user, other = await make_user(session), await make_user(session, "otro@club.es")
    session.add_all([new_session(user), new_session(user), new_session(other)])
    await session.flush()

    await session.execute(delete(User).where(User.id == user.id))

    remaining = (
        await session.execute(select(func.count()).select_from(RefreshSession))
    ).scalar_one()
    assert remaining == 1
