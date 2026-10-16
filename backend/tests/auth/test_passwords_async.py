import asyncio
import time

from argon2 import PasswordHasher

from app.auth import passwords
from app.auth.passwords import (
    hash_password,
    needs_rehash,
    spend_verification_time_async,
    verify_password_async,
)


async def test_async_verify_accepts_the_right_password() -> None:
    assert await verify_password_async("correct horse", hash_password("correct horse"))


async def test_async_verify_rejects_the_wrong_password() -> None:
    assert not await verify_password_async("battery", hash_password("correct horse"))


async def test_verification_does_not_block_the_event_loop() -> None:
    password_hash = hash_password("correct horse")
    ticks = 0

    async def ticker() -> None:
        nonlocal ticks
        while True:
            await asyncio.sleep(0.001)
            ticks += 1

    task = asyncio.create_task(ticker())
    started = time.perf_counter()
    await verify_password_async("correct horse", password_hash)
    elapsed = time.perf_counter() - started
    task.cancel()

    assert ticks >= 2 or elapsed < 0.01


async def test_spending_verification_time_returns_nothing() -> None:
    assert await spend_verification_time_async("whatever") is None


def test_fresh_hash_does_not_need_rehash() -> None:
    assert not needs_rehash(hash_password("correct horse"))


def test_hash_made_with_weaker_parameters_needs_rehash() -> None:
    weak = PasswordHasher(time_cost=1, memory_cost=8, parallelism=1).hash("correct horse")

    assert needs_rehash(weak)


def test_malformed_hash_needs_rehash() -> None:
    assert needs_rehash("not-a-hash")


def test_warm_up_precomputes_the_dummy_hash() -> None:
    passwords.warm_up()

    assert passwords._dummy_hash.cache_info().currsize == 1
