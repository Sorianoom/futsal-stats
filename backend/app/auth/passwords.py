"""Hash de contraseñas con argon2id. Las versiones async usan un pool de hilos acotado."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

MAX_PASSWORD_LENGTH = 256
HASH_WORKERS = 4

_hasher = PasswordHasher()
_executor = ThreadPoolExecutor(max_workers=HASH_WORKERS, thread_name_prefix="argon2")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


@lru_cache
def _dummy_hash() -> str:
    return hash_password("dummy-password-for-timing")


def warm_up() -> None:
    """Precalcula el hash ficticio para que la primera petición con email inexistente no se note."""
    _dummy_hash()


def spend_verification_time(password: str) -> None:
    """Gasta el mismo tiempo que una verificación real cuando el usuario no existe."""
    verify_password(password, _dummy_hash())


async def hash_password_async(password: str) -> str:
    return await asyncio.get_running_loop().run_in_executor(_executor, hash_password, password)


async def verify_password_async(password: str, password_hash: str) -> bool:
    return await asyncio.get_running_loop().run_in_executor(
        _executor, verify_password, password, password_hash
    )


async def spend_verification_time_async(password: str) -> None:
    await asyncio.get_running_loop().run_in_executor(_executor, spend_verification_time, password)
