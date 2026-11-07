"""Fallos de login en la BD: los comparten todas las instancias de la API."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import login_failures_repo as repo
from app.db.models import LoginFailure

NOW = datetime(2026, 11, 7, 12, 0, tzinfo=UTC)
WINDOW = timedelta(minutes=5)
A, B, C = "a" * 64, "b" * 64, "c" * 64


async def fail(db: AsyncSession, *digests: str, at: datetime = NOW, times: int = 1) -> None:
    for _ in range(times):
        await repo.record_failures(db, digests, at, forget_before=at - WINDOW)


async def rows(db: AsyncSession) -> int:
    return (await db.execute(select(func.count()).select_from(LoginFailure))).scalar_one()


async def test_counts_failures_per_key_inside_the_window(session: AsyncSession) -> None:
    await fail(session, A, B, times=3)
    await fail(session, A)

    counts = await repo.count_failures_since(session, [A, B, C], NOW - WINDOW)

    assert counts == {A: 4, B: 3}


async def test_failures_older_than_the_window_do_not_count(session: AsyncSession) -> None:
    await fail(session, A, at=NOW - WINDOW - timedelta(seconds=1))
    await fail(session, A, at=NOW - timedelta(minutes=1))

    counts = await repo.count_failures_since(session, [A], NOW - WINDOW)

    assert counts == {A: 1}


async def test_recording_a_failure_forgets_every_key_older_than_the_window(
    session: AsyncSession,
) -> None:
    old = NOW - WINDOW - timedelta(minutes=1)
    await fail(session, A, B, at=old)

    await fail(session, C)

    assert await rows(session) == 1
    assert await repo.count_failures_since(session, [A, B, C], old) == {C: 1}


async def test_clearing_keys_removes_only_those(session: AsyncSession) -> None:
    await fail(session, A, B, C)

    await repo.clear_failures(session, [A, C])

    assert await repo.count_failures_since(session, [A, B, C], NOW - WINDOW) == {B: 1}


async def test_counting_no_keys_is_empty(session: AsyncSession) -> None:
    assert await repo.count_failures_since(session, [], NOW - WINDOW) == {}
