"""Acceso a datos de usuarios."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.passwords import MAX_PASSWORD_LENGTH, hash_password
from app.db.models import User
from app.domain.roles import Role

MIN_PASSWORD_LENGTH = 12


class WeakPasswordError(ValueError):
    """La contraseña no cumple la longitud mínima."""


def normalize_email(email: str) -> str:
    return email.strip().lower()


def validate_password(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise WeakPasswordError(
            f"La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres"
        )
    if len(password) > MAX_PASSWORD_LENGTH:
        raise WeakPasswordError(f"La contraseña no puede superar {MAX_PASSWORD_LENGTH} caracteres")


async def add_user(
    session: AsyncSession,
    email: str,
    password_hash: str,
    role: Role,
    player_id: uuid.UUID | None = None,
    display_name: str | None = None,
) -> User:
    """Guarda un usuario con la contraseña ya validada y hasheada (p. ej. en un hilo aparte)."""
    user = User(
        email=normalize_email(email),
        password_hash=password_hash,
        role=role,
        player_id=player_id,
        display_name=display_name,
    )
    session.add(user)
    await session.flush()
    return user


async def create_user(
    session: AsyncSession,
    email: str,
    password: str,
    role: Role,
    player_id: uuid.UUID | None = None,
) -> User:
    validate_password(password)
    return await add_user(session, email, hash_password(password), role, player_id)


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    query = select(User).where(User.email == normalize_email(email))
    return (await session.execute(query)).scalar_one_or_none()


async def get_user(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await session.get(User, user_id)
