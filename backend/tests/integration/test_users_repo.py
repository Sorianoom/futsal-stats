import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.passwords import verify_password
from app.db.users_repo import (
    WeakPasswordError,
    create_user,
    get_user,
    get_user_by_email,
)
from app.domain.roles import Role

PASSWORD = "a-long-enough-password"


async def test_created_user_stores_a_hash_and_a_normalised_email(session: AsyncSession) -> None:
    user = await create_user(session, "  Coach@Club.ES ", PASSWORD, Role.HEAD_COACH)

    assert user.email == "coach@club.es"
    assert user.password_hash != PASSWORD
    assert verify_password(PASSWORD, user.password_hash)


async def test_short_password_is_rejected(session: AsyncSession) -> None:
    with pytest.raises(WeakPasswordError):
        await create_user(session, "a@club.es", "short", Role.HEAD_COACH)


async def test_duplicate_email_is_rejected_regardless_of_case(session: AsyncSession) -> None:
    await create_user(session, "a@club.es", PASSWORD, Role.HEAD_COACH)

    with pytest.raises(IntegrityError):
        await create_user(session, "A@CLUB.ES", PASSWORD, Role.ASSISTANT_COACH)


async def test_users_are_found_by_email_and_by_id(session: AsyncSession) -> None:
    user = await create_user(session, "a@club.es", PASSWORD, Role.ASSISTANT_COACH)

    assert (await get_user_by_email(session, "A@club.es")) == user
    assert (await get_user(session, user.id)) == user
    assert await get_user_by_email(session, "ghost@club.es") is None


async def test_overlong_password_is_rejected(session: AsyncSession) -> None:
    with pytest.raises(WeakPasswordError):
        await create_user(session, "a@club.es", "x" * 257, Role.HEAD_COACH)
