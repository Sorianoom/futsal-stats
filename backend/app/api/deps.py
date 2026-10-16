"""Dependencias de autenticación y autorización. El rol se lee de la BD, no del token."""

from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import ApiError
from app.auth.tokens import TokenError, TokenType, decode_token
from app.config import Settings, get_settings
from app.db.models import User
from app.db.session import get_session
from app.db.users_repo import get_user
from app.domain.roles import Role

SettingsDep = Annotated[Settings, Depends(get_settings)]
SessionDep = Annotated[AsyncSession, Depends(get_session)]


def unauthorized() -> ApiError:
    return ApiError(
        401,
        "unauthorized",
        "Credenciales no válidas o caducadas",
        {"WWW-Authenticate": "Bearer"},
    )


async def require_trusted_origin(request: Request, settings: SettingsDep) -> None:
    """Rechaza POST con cookie desde un Origin ajeno (p. ej. otro subdominio hermano).

    Un navegador siempre envía Origin en un POST entre orígenes; sin cabecera no es un navegador.
    """
    origin = request.headers.get("Origin")
    if origin is not None and origin not in settings.cors_origins:
        raise ApiError(403, "forbidden", "Origen no permitido")


def _bearer_token(request: Request) -> str:
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise unauthorized()
    return token.strip()


async def get_current_user(request: Request, settings: SettingsDep, session: SessionDep) -> User:
    try:
        claims = decode_token(_bearer_token(request), TokenType.ACCESS, settings)
    except TokenError as error:
        raise unauthorized() from error
    user = await get_user(session, claims.user_id)
    if user is None or not user.is_active:
        raise unauthorized()
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: Role) -> Callable[[User], Awaitable[User]]:
    async def checker(user: CurrentUser) -> User:
        if user.role not in roles:
            raise ApiError(403, "forbidden", "No tienes permisos para esta acción")
        return user

    return checker


HeadCoach = Annotated[User, Depends(require_roles(Role.HEAD_COACH))]
