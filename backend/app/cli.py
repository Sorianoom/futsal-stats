"""Comandos de administración: `uv run python -m app.cli create-user EMAIL --role head_coach`."""

import argparse
import asyncio
import getpass
import sys
from collections.abc import Sequence

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.engine import build_engine
from app.db.users_repo import WeakPasswordError, create_user
from app.domain.roles import Role


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


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create-user", help="Crea un usuario (pide la contraseña)")
    create.add_argument("email")
    create.add_argument("--role", type=Role, choices=list(Role), required=True)
    args = parser.parse_args(argv)

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


if __name__ == "__main__":
    raise SystemExit(main())
