"""Sesiones async de SQLAlchemy como dependencia de FastAPI."""

from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.config import get_settings
from app.db.engine import build_engine


@lru_cache
def get_engine() -> AsyncEngine:
    return build_engine(get_settings().database_url)


@lru_cache
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with get_sessionmaker()() as session:
        yield session


async def dispose_engine() -> None:
    if get_engine.cache_info().currsize:
        await get_engine().dispose()
