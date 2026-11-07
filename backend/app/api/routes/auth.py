"""Login, refresco, cierre de sesión y usuario actual."""

import logging
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Request, Response
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import (
    CurrentUser,
    HeadCoach,
    SessionDep,
    SettingsDep,
    require_trusted_origin,
    unauthorized,
)
from app.api.envelope import Envelope, ok
from app.api.errors import ApiError
from app.auth.passwords import (
    hash_password_async,
    needs_rehash,
    spend_verification_time_async,
    verify_password_async,
)
from app.auth.rate_limit import WINDOW, LoginKeys, client_ip, is_blocked, login_keys
from app.auth.refresh_flow import rotate_refresh_token
from app.auth.tokens import TokenError, TokenType, create_token, decode_token
from app.config import Settings
from app.db.login_failures_repo import clear_failures, count_failures_since, record_failures
from app.db.models import User
from app.db.refresh_sessions_repo import (
    Rotation,
    create_session,
    delete_expired,
    revoke,
    revoke_all_for_user,
)
from app.db.users_repo import get_user, get_user_by_email
from app.domain.auth_sessions import RevokeReason
from app.schemas.auth import LoginData, LoginRequest, SessionsRevoked, TokenData, UserOut

REFRESH_COOKIE = "refresh_token"
SECONDS_PER_DAY = 86400

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


def _login_keys(request: Request, email: str, settings: Settings) -> LoginKeys:
    socket_host = request.client.host if request.client else None
    ip = client_ip(socket_host, request.headers, behind_vercel=settings.vercel)
    return login_keys(ip, email, settings.require_jwt_secret())


async def _is_blocked(session: SessionDep, keys: LoginKeys, now: datetime) -> bool:
    counts = await count_failures_since(session, (keys.pair, keys.ip, keys.email), now - WINDOW)
    return is_blocked(keys, counts)


async def _failed_login(session: SessionDep, keys: LoginKeys, now: datetime) -> ApiError:
    """Anota el fallo y lo confirma ya: el 401 que sigue no debe deshacerlo."""
    await record_failures(
        session, (keys.pair, keys.ip, keys.email), now, forget_before=now - WINDOW
    )
    await session.commit()
    return _invalid_credentials()


def _set_refresh_cookie(
    response: Response, user: User, rotation: Rotation, settings: Settings, now: datetime
) -> None:
    """La cookie y el token caducan por inactividad, pero nunca después del tope de la sesión."""
    cap = rotation.session.absolute_expires_at
    token = create_token(
        user.id, user.role, TokenType.REFRESH, settings, now=now, jti=rotation.jti, expires_cap=cap
    )
    max_age = min(
        settings.refresh_token_ttl_days * SECONDS_PER_DAY, int((cap - now).total_seconds())
    )
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=max(max_age, 0),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path=settings.refresh_cookie_path,
    )


async def _revoke_presented_session(
    session: SessionDep, refresh_token: str | None, settings: Settings
) -> None:
    """Cierra la sesión del refresco presentado. Sin cookie o con un token inválido no hay nada
    que cerrar: el navegador igualmente olvida la cookie."""
    if not refresh_token:
        return
    try:
        claims = decode_token(refresh_token, TokenType.REFRESH, settings)
    except TokenError:
        return
    if claims.jti is None:
        return
    await revoke(session, claims.jti, RevokeReason.LOGOUT, datetime.now(UTC))
    await session.commit()


async def _purge_expired_sessions(session: SessionDep, now: datetime) -> None:
    """Limpieza oportunista tras confirmar el login: si falla se registra y el login sigue."""
    try:
        deleted = await delete_expired(session, now)
        await session.commit()
    except SQLAlchemyError:
        logger.exception("No se pudieron borrar las sesiones de refresco caducadas")
        await session.rollback()
        return
    if deleted:
        logger.info("Borradas %d sesiones de refresco caducadas", deleted)


def _access_token(user: User, settings: Settings) -> TokenData:
    return TokenData(
        access_token=create_token(user.id, user.role, TokenType.ACCESS, settings),
        expires_in=settings.access_token_ttl_minutes * 60,
    )


def _invalid_credentials() -> ApiError:
    return ApiError(401, "invalid_credentials", "Email o contraseña incorrectos")


@router.post("/login", response_model=Envelope[LoginData])
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    session: SessionDep,
    settings: SettingsDep,
) -> Envelope[LoginData]:
    keys, now = _login_keys(request, payload.email, settings), datetime.now(UTC)
    if await _is_blocked(session, keys, now):
        raise ApiError(
            429,
            "too_many_attempts",
            "Demasiados intentos fallidos. Inténtalo más tarde",
            {"Retry-After": str(int(WINDOW.total_seconds()))},
        )
    user = await get_user_by_email(session, payload.email)
    if user is None:
        await spend_verification_time_async(payload.password)
        raise await _failed_login(session, keys, now)
    password_ok = await verify_password_async(payload.password, user.password_hash)
    if not password_ok or not user.is_active:
        raise await _failed_login(session, keys, now)
    # Un login correcto limpia el par y el email, pero no el contador de la IP.
    await clear_failures(session, (keys.pair, keys.email))
    if needs_rehash(user.password_hash):
        user.password_hash = await hash_password_async(payload.password)
    opened = await create_session(session, user.id, now, settings.refresh_session_max_days)
    await session.commit()
    _set_refresh_cookie(response, user, Rotation(opened, opened.current_jti), settings, now)
    token = _access_token(user, settings)
    body = ok(LoginData(**token.model_dump(), user=UserOut.model_validate(user)))
    # Después de construir la respuesta: un rollback de la limpieza caduca los objetos ORM.
    await _purge_expired_sessions(session, now)
    return body


@router.post(
    "/refresh",
    response_model=Envelope[TokenData],
    dependencies=[Depends(require_trusted_origin)],
)
async def refresh(
    response: Response,
    session: SessionDep,
    settings: SettingsDep,
    refresh_token: Annotated[str | None, Cookie()] = None,
) -> Envelope[TokenData]:
    if not refresh_token:
        raise unauthorized()
    try:
        claims = decode_token(refresh_token, TokenType.REFRESH, settings)
    except TokenError as error:
        raise unauthorized() from error
    # Antes de tocar las sesiones: adoptar el refresco de un usuario inexistente rompería la FK.
    user = await get_user(session, claims.user_id)
    if user is None or not user.is_active:
        raise unauthorized()
    now = datetime.now(UTC)
    rotation = await rotate_refresh_token(session, refresh_token, claims, settings, now)
    # Se confirma también al rechazar: una revocación por reutilización no debe perderse.
    await session.commit()
    if rotation is None or rotation.session.user_id != user.id:
        raise unauthorized()
    _set_refresh_cookie(response, user, rotation, settings, now)
    return ok(_access_token(user, settings))


@router.post(
    "/logout",
    response_model=Envelope[None],
    dependencies=[Depends(require_trusted_origin)],
)
async def logout(
    response: Response,
    session: SessionDep,
    settings: SettingsDep,
    refresh_token: Annotated[str | None, Cookie()] = None,
) -> Envelope[None]:
    await _revoke_presented_session(session, refresh_token, settings)
    response.delete_cookie(
        REFRESH_COOKIE,
        path=settings.refresh_cookie_path,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )
    return ok(None)


@router.get("/me", response_model=Envelope[UserOut])
async def me(user: CurrentUser) -> Envelope[UserOut]:
    return ok(UserOut.model_validate(user))


@router.delete("/users/{user_id}/sessions", response_model=Envelope[SessionsRevoked])
async def revoke_user_sessions(
    user_id: uuid.UUID, _: HeadCoach, session: SessionDep
) -> Envelope[SessionsRevoked]:
    """Cierra todas las sesiones de un usuario (iPad perdido, baja). Solo el entrenador principal.

    Los tokens de acceso ya emitidos siguen valiendo hasta que caducan (minutos); el refresco no.
    """
    if await get_user(session, user_id) is None:
        raise ApiError(404, "not_found", "Usuario no encontrado")
    revoked = await revoke_all_for_user(session, user_id, datetime.now(UTC))
    await session.commit()
    return ok(SessionsRevoked(revoked=revoked))
