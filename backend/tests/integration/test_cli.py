from collections.abc import AsyncIterator
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

import app.cli as cli
from app.config import Settings
from app.db import points_repo
from app.db.models import Match
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


@pytest.fixture
async def clean_matches(engine: AsyncEngine, use_test_database: None) -> AsyncIterator[None]:
    """Los comandos confirman de verdad en la base de pruebas: se limpia aunque el test falle."""
    yield
    async with engine.begin() as connection:
        await connection.execute(text("DELETE FROM matches"))
        await connection.execute(text("DELETE FROM sessions WHERE kind = 'match'"))


async def count_matches(engine: AsyncEngine) -> int:
    async with engine.connect() as connection:
        return int((await connection.execute(text("SELECT count(*) FROM matches"))).scalar_one())


def write_calendar(tmp_path: Path, content: str | bytes) -> str:
    path = tmp_path / "calendario.txt"
    if isinstance(content, str):
        content = content.encode("utf-8")
    path.write_bytes(content)
    return str(path)


@pytest.mark.usefixtures("clean_matches")
async def test_import_matches_creates_the_matches_of_the_file(
    engine: AsyncEngine, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    path = write_calendar(tmp_path, "2026-11-08 Nevada Eagles\n2026-11-15 Puerto de Motril\n")

    code = await _run_main(["import-matches", path])

    assert code == 0
    assert await count_matches(engine) == 2
    assert "Importados 2 partidos (0 ya existían)" in capsys.readouterr().out


@pytest.mark.usefixtures("clean_matches")
async def test_import_matches_twice_does_not_duplicate(
    engine: AsyncEngine, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    path = write_calendar(tmp_path, "2026-11-08 Nevada Eagles\n")
    await _run_main(["import-matches", path])
    capsys.readouterr()

    code = await _run_main(["import-matches", path])

    assert code == 0
    assert await count_matches(engine) == 1
    assert "Importados 0 partidos (1 ya existían)" in capsys.readouterr().out


@pytest.mark.usefixtures("clean_matches")
async def test_import_matches_dry_run_writes_nothing(
    engine: AsyncEngine, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    path = write_calendar(tmp_path, "2026-11-08 Nevada Eagles\n")

    code = await _run_main(["import-matches", path, "--dry-run"])

    assert code == 0
    assert await count_matches(engine) == 0
    assert "Se importarían 1 partidos (0 ya existen)" in capsys.readouterr().out


@pytest.mark.usefixtures("clean_matches")
async def test_import_matches_reports_the_bad_line_and_creates_nothing(
    engine: AsyncEngine, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    path = write_calendar(tmp_path, "2026-11-08 Nevada Eagles\nmañana Otro\n")

    code = await _run_main(["import-matches", path])

    assert code == 1
    assert await count_matches(engine) == 0
    assert "Línea 2" in capsys.readouterr().err


@pytest.mark.usefixtures("clean_matches")
@pytest.mark.parametrize("day", ["2062-11-08", "1999-11-08"])
async def test_import_matches_rejects_dates_the_api_would_reject(
    engine: AsyncEngine, tmp_path: Path, capsys: pytest.CaptureFixture[str], day: str
) -> None:
    path = write_calendar(tmp_path, f"2026-11-08 Nevada Eagles\n{day} Errata FS\n")

    code = await _run_main(["import-matches", path])

    assert code == 1
    assert await count_matches(engine) == 0
    error = capsys.readouterr().err
    assert "rango razonable" in error
    assert day in error


@pytest.mark.usefixtures("clean_matches")
async def test_import_matches_reads_a_file_saved_with_a_bom(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    path = write_calendar(tmp_path, b"\xef\xbb\xbf2026-11-08 Nevada Eagles\n")

    code = await _run_main(["import-matches", path, "--dry-run"])

    assert code == 0
    assert "Se importarían 1 partidos" in capsys.readouterr().out


@pytest.mark.usefixtures("clean_matches")
async def test_import_matches_explains_a_file_that_is_not_utf8(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    path = write_calendar(tmp_path, "2026-11-08 Botellines de Lanjarón\n".encode("latin-1"))

    code = await _run_main(["import-matches", path])

    assert code == 1
    assert "UTF-8" in capsys.readouterr().err


@pytest.mark.usefixtures("clean_matches")
async def test_import_matches_reports_a_missing_file(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code = await _run_main(["import-matches", str(tmp_path / "no-existe.txt")])

    assert code == 1
    assert "No se pudo leer" in capsys.readouterr().err


@pytest.mark.usefixtures("clean_matches")
async def test_import_matches_reports_a_database_that_is_not_reachable(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    async def unreachable(*_args: object) -> None:
        raise OSError("sin conexión")

    monkeypatch.setattr(cli, "run_import_matches", unreachable)
    path = write_calendar(tmp_path, "2026-11-08 Nevada Eagles\n")

    code = await _run_main(["import-matches", path])

    assert code == 1
    assert "No se pudo importar" in capsys.readouterr().err


@pytest.mark.usefixtures("clean_matches")
async def test_import_matches_leaves_nothing_behind_if_an_insert_fails_midway(
    engine: AsyncEngine,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    original = points_repo.create_match
    calls = 0

    async def fails_on_the_second(db: AsyncSession, held_on: date, opponent: str) -> Match:
        nonlocal calls
        calls += 1
        if calls == 2:
            raise SQLAlchemyError("fallo simulado")
        return await original(db, held_on, opponent)

    monkeypatch.setattr(points_repo, "create_match", fails_on_the_second)
    path = write_calendar(tmp_path, "2026-11-08 Nevada Eagles\n2026-11-15 Puerto de Motril\n")

    code = await _run_main(["import-matches", path])

    assert code == 1
    assert await count_matches(engine) == 0
    assert "No se pudo importar" in capsys.readouterr().err


async def _run_main(argv: list[str]) -> int:
    import asyncio

    return await asyncio.to_thread(cli.main, argv)


def test_create_user_command_does_not_offer_the_player_role() -> None:
    with pytest.raises(SystemExit):
        cli.main(["create-user", "jugador@club.es", "--role", "player"])


@pytest.mark.usefixtures("use_test_database")
async def test_resettle_round_without_an_official_match_that_day_changes_nothing(
    capsys: pytest.CaptureFixture[str],
) -> None:
    code = await _run_main(["resettle-round", "2026-11-22", "--dry-run"])

    assert code == 1
    assert "Hay 0 partidos oficiales el 2026-11-22" in capsys.readouterr().err
