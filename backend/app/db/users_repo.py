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


async def create_user(session: AsyncSession, email: str, password: str, role: Role) -> User:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise WeakPasswordError(
            f"La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres"
        )
    if len(password) > MAX_PASSWORD_LENGTH:
        raise WeakPasswordError(f"La contraseña no puede superar {MAX_PASSWORD_LENGTH} caracteres")
    user = User(email=normalize_email(email), password_hash=hash_password(password), role=role)
    session.add(user)
    await session.flush()
    return user


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    query = select(User).where(User.email == normalize_email(email))
    return (await session.execute(query)).scalar_one_or_none()


async def get_user(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await session.get(User, user_id)
