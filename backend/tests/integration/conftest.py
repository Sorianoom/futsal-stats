"""Fixtures de integración: Postgres real migrado con Alembic (futsal_test en docker compose)."""

import asyncio
import os
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.db.engine import build_engine

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://futsal:futsal@localhost:54329/futsal_test"
)
BACKEND_DIR = Path(__file__).parents[2]


def alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    config.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    return config


async def _database_is_reachable() -> bool:
    engine = build_engine(TEST_DATABASE_URL, pooled=False)
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
    except OSError:
        return False
    finally:
        await engine.dispose()
    return True


@pytest.fixture(scope="session")
def migrated_database() -> Iterator[str]:
    if not asyncio.run(_database_is_reachable()):
        pytest.skip("Postgres de pruebas no disponible: docker compose up -d db")
    config = alembic_config()
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    yield TEST_DATABASE_URL


@pytest.fixture
async def engine(migrated_database: str) -> AsyncIterator[AsyncEngine]:
    engine = build_engine(migrated_database, pooled=False)
    yield engine
    await engine.dispose()


@pytest.fixture
async def session(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    """Sesión dentro de una transacción externa que siempre se revierte."""
    async with engine.connect() as connection:
        transaction = await connection.begin()
        async with AsyncSession(
            bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False
        ) as db_session:
            yield db_session
        await transaction.rollback()
