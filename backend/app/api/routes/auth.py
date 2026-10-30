"""Login, refresco, cierre de sesión y usuario actual."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Request, Response

from app.api.deps import (
    CurrentUser,
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
from app.auth.rate_limit import LoginGuard
from app.auth.refresh_flow import rotate_refresh_token
from app.auth.tokens import TokenError, TokenType, create_token, decode_token
from app.config import Settings
from app.db.models import User
from app.db.refresh_sessions_repo import Rotation, create_session, revoke
from app.db.users_repo import get_user, get_user_by_email
from app.domain.auth_sessions import RevokeReason
from app.schemas.auth import LoginData, LoginRequest, TokenData, UserOut

REFRESH_COOKIE = "refresh_token"
SECONDS_PER_DAY = 86400

router = APIRouter(prefix="/auth", tags=["auth"])


def _guard(request: Request) -> LoginGuard:
    guard: LoginGuard = request.app.state.login_guard
    return guard


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


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
    guard, ip = _guard(request), _client_ip(request)
    if guard.is_blocked(ip, payload.email):
        raise ApiError(
            429,
            "too_many_attempts",
            "Demasiados intentos fallidos. Inténtalo más tarde",
            {"Retry-After": str(int(guard.window_seconds))},
        )
    user = await get_user_by_email(session, payload.email)
    if user is None:
        await spend_verification_time_async(payload.password)
        guard.record_failure(ip, payload.email)
        raise _invalid_credentials()
    password_ok = await verify_password_async(payload.password, user.password_hash)
    if not password_ok or not user.is_active:
        guard.record_failure(ip, payload.email)
        raise _invalid_credentials()
    guard.reset(ip, payload.email)
    if needs_rehash(user.password_hash):
        user.password_hash = await hash_password_async(payload.password)
    now = datetime.now(UTC)
    opened = await create_session(session, user.id, now, settings.refresh_session_max_days)
    await session.commit()
    _set_refresh_cookie(response, user, Rotation(opened, opened.current_jti), settings, now)
    token = _access_token(user, settings)
    return ok(LoginData(**token.model_dump(), user=UserOut.model_validate(user)))


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
