import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

import app.cli as cli
from app.config import Settings
from app.domain.roles import Role

PASSWORD = "a-long-enough-password"


@pytest.fixture
def use_test_database(migrated_database: str, monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(_env_file=None, database_url=migrated_database)
    monkeypatch.setattr(cli, "get_settings", lambda: settings)


async def delete_users(engine: AsyncEngine) -> None:
    async with engine.begin() as connection:
        await connection.execute(text("DELETE FROM users"))


async def test_create_user_command_stores_the_user(
    engine: AsyncEngine, migrated_database: str
) -> None:
    await cli.run_create_user(migrated_database, "cli@club.es", Role.HEAD_COACH, PASSWORD)

    async with engine.connect() as connection:
        row = (
            await connection.execute(text("SELECT role FROM users WHERE email = 'cli@club.es'"))
        ).one()
    await delete_users(engine)
    assert row.role == "head_coach"


@pytest.mark.usefixtures("use_test_database")
async def test_main_creates_a_user_after_confirming_the_password(
    engine: AsyncEngine, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(cli.getpass, "getpass", lambda _prompt: PASSWORD)

    code = await _run_main(["create-user", "main@club.es", "--role", "assistant_coach"])

    await delete_users(engine)
    assert code == 0
    assert "main@club.es" in capsys.readouterr().out


@pytest.mark.usefixtures("use_test_database")
async def test_main_fails_when_passwords_do_not_match(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    answers = iter([PASSWORD, "another-password-entirely"])
    monkeypatch.setattr(cli.getpass, "getpass", lambda _prompt: next(answers))

    code = await _run_main(["create-user", "x@club.es", "--role", "head_coach"])

    assert code == 1
    assert "no coinciden" in capsys.readouterr().err


@pytest.mark.usefixtures("use_test_database")
async def test_main_reports_a_weak_password(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(cli.getpass, "getpass", lambda _prompt: "short")

    code = await _run_main(["create-user", "x@club.es", "--role", "head_coach"])

    assert code == 1
    assert "al menos" in capsys.readouterr().err


@pytest.mark.usefixtures("use_test_database")
async def test_main_reports_a_duplicate_email(
    engine: AsyncEngine, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(cli.getpass, "getpass", lambda _prompt: PASSWORD)
    await _run_main(["create-user", "dup@club.es", "--role", "head_coach"])

    code = await _run_main(["create-user", "dup@club.es", "--role", "head_coach"])

    await delete_users(engine)
    assert code == 1
    assert "Ya existe" in capsys.readouterr().err


async def _run_main(argv: list[str]) -> int:
    import asyncio

    return await asyncio.to_thread(cli.main, argv)
