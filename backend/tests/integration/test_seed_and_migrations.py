import pytest
from alembic import command
from sqlalchemy import func, inspect, select, text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.config import Settings, get_settings
from app.db import seed
from app.db.models import InfractionRow
from app.domain.points.default_catalog import DEFAULT_CATALOG
from tests.integration.conftest import alembic_config


async def test_seed_command_loads_the_catalog(
    engine: AsyncEngine, migrated_database: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(seed, "get_settings", lambda: Settings(database_url=migrated_database))
    async with engine.begin() as connection:
        await connection.execute(text("DELETE FROM attendance_rules"))
        await connection.execute(text("DELETE FROM infractions"))

    await seed.main()

    async with engine.connect() as connection:
        total = (
            await connection.execute(select(func.count()).select_from(InfractionRow))
        ).scalar_one()
    assert total == len(DEFAULT_CATALOG)


async def test_migration_can_be_downgraded_and_upgraded_again(
    engine: AsyncEngine, migrated_database: str
) -> None:
    config = alembic_config()

    await _run_in_thread(command.downgrade, config, "base")
    async with engine.connect() as connection:
        tables = await connection.run_sync(lambda c: set(inspect(c).get_table_names()))
    assert tables <= {"alembic_version"}

    await _run_in_thread(command.upgrade, config, "head")
    async with engine.connect() as connection:
        tables = await connection.run_sync(lambda c: set(inspect(c).get_table_names()))
    assert "stints" in tables


async def _run_in_thread(func, *args) -> None:  # type: ignore[no-untyped-def]
    import asyncio

    await asyncio.to_thread(func, *args)


def test_settings_are_cached() -> None:
    assert get_settings() is get_settings()
