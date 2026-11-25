"""Comandos de administración.

`uv run python -m app.cli create-user EMAIL --role head_coach`
`uv run python -m app.cli import-matches docs/calendario-2026-27.txt [--dry-run]`
`uv run python -m app.cli resettle-round 2026-11-22 [--dry-run]`
"""

import argparse
import asyncio
import getpass
import sys
from collections.abc import Sequence
from datetime import UTC, date, datetime
from pathlib import Path

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.calendar_repo import ImportResult, import_matches
from app.db.engine import build_engine
from app.db.models import Match, TeamSession
from app.db.users_repo import WeakPasswordError, create_user
from app.domain.calendar_import import CalendarEntry, CalendarError, parse_calendar
from app.domain.roles import STAFF_ROLES, Role
from app.schemas.points import MatchCreate
from app.services.fantasy_resettle import ParticipantChange, ResettleError, resettle_round


async def run_create_user(database_url: str, email: str, role: Role, password: str) -> None:
    engine = build_engine(database_url, pooled=False)
    try:
        async with AsyncSession(engine) as session, session.begin():
            await create_user(session, email, password, role)
    finally:
        await engine.dispose()


def _ask_password() -> str | None:
    password = getpass.getpass("Contraseña: ")
    if password != getpass.getpass("Repite la contraseña: "):
        return None
    return password


async def run_import_matches(
    database_url: str, entries: Sequence[CalendarEntry], dry_run: bool
) -> ImportResult:
    engine = build_engine(database_url, pooled=False)
    try:
        async with AsyncSession(engine) as session, session.begin():
            return await import_matches(session, entries, dry_run=dry_run)
    finally:
        await engine.dispose()


async def run_resettle_round(
    database_url: str, held_on: date, dry_run: bool
) -> list[ParticipantChange]:
    """Vuelve a cerrar la jornada del partido oficial de ese día. Con `dry_run`, lo deshace."""
    engine = build_engine(database_url, pooled=False)
    try:
        async with AsyncSession(engine) as session:
            query = (
                select(Match.id)
                .join(TeamSession, TeamSession.id == Match.session_id)
                .where(TeamSession.held_on == held_on, Match.is_official.is_(True))
            )
            match_ids = (await session.execute(query)).scalars().all()
            if len(match_ids) != 1:
                raise ResettleError(f"Hay {len(match_ids)} partidos oficiales el {held_on}")
            changes = await resettle_round(session, match_ids[0], datetime.now(UTC))
            if dry_run:
                await session.rollback()
            else:
                await session.commit()
            return changes
    finally:
        await engine.dispose()


def _resettle_round(args: argparse.Namespace) -> int:
    try:
        changes = asyncio.run(
            run_resettle_round(get_settings().migrations_database_url, args.date, args.dry_run)
        )
    except (ResettleError, OSError, SQLAlchemyError) as error:
        print(f"No se ha cambiado nada: {error}", file=sys.stderr)
        return 1
    for c in changes:
        print(
            f"{c.name}: {c.points_before} → {c.points_after} puntos "
            f"(cobro {c.payout_before / 1000:g} → {c.payout_after / 1000:g} M)"
        )
    print("Simulacro: no se ha guardado nada" if args.dry_run else "Jornada cerrada de nuevo")
    return 0


def _create_user(args: argparse.Namespace) -> int:
    password = _ask_password()
    if password is None:
        print("Las contraseñas no coinciden", file=sys.stderr)
        return 1
    try:
        asyncio.run(
            run_create_user(get_settings().migrations_database_url, args.email, args.role, password)
        )
    except WeakPasswordError as error:
        print(error, file=sys.stderr)
        return 1
    except IntegrityError:
        print("Ya existe un usuario con ese email", file=sys.stderr)
        return 1
    print(f"Usuario {args.email} creado como {args.role.value}")
    return 0


def _check_like_the_api(entry: CalendarEntry) -> None:
    """Mismas reglas que `POST /matches`: fecha en un rango razonable y rival con su límite."""
    try:
        MatchCreate(held_on=entry.held_on, opponent=entry.opponent)
    except ValidationError as error:
        reason = error.errors()[0]["msg"].removeprefix("Value error, ")
        raise CalendarError(f"{entry.held_on} {entry.opponent}: {reason}") from error


def _read_calendar(file: str) -> list[CalendarEntry]:
    try:
        # `utf-8-sig` quita la marca BOM que añaden algunos editores de Windows.
        text = Path(file).read_text(encoding="utf-8-sig")
    except UnicodeDecodeError as error:
        raise CalendarError(f"{file} no está guardado en UTF-8") from error
    except OSError as error:
        raise CalendarError(f"No se pudo leer {file}: {error.strerror or error}") from error
    entries = parse_calendar(text)
    for entry in entries:
        _check_like_the_api(entry)
    return entries


def _import_matches(args: argparse.Namespace) -> int:
    try:
        entries = _read_calendar(args.file)
    except CalendarError as error:
        print(error, file=sys.stderr)
        return 1
    try:
        result = asyncio.run(
            run_import_matches(get_settings().migrations_database_url, entries, args.dry_run)
        )
    except (OSError, SQLAlchemyError) as error:
        print(f"No se pudo importar, no se ha guardado nada: {error}", file=sys.stderr)
        return 1
    verb = "Se importarían" if args.dry_run else "Importados"
    already = "ya existen" if args.dry_run else "ya existían"
    print(f"{verb} {result.created} partidos ({result.existing} {already})")
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create-user", help="Crea un usuario (pide la contraseña)")
    create.add_argument("email")
    create.add_argument("--role", type=Role, choices=list(STAFF_ROLES), required=True)
    importer = commands.add_parser(
        "import-matches", help="Crea los partidos de un calendario (AAAA-MM-DD Rival por línea)"
    )
    importer.add_argument("file")
    importer.add_argument("--dry-run", action="store_true", help="Cuenta sin escribir nada")
    resettle = commands.add_parser(
        "resettle-round", help="Vuelve a cerrar la última jornada cerrada (fecha AAAA-MM-DD)"
    )
    resettle.add_argument("date", type=date.fromisoformat)
    resettle.add_argument("--dry-run", action="store_true", help="Calcula sin guardar nada")
    args = parser.parse_args(argv)

    if args.command == "create-user":
        return _create_user(args)
    if args.command == "resettle-round":
        return _resettle_round(args)
    return _import_matches(args)


if __name__ == "__main__":
    raise SystemExit(main())
