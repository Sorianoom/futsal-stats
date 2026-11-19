"""Login, refresco, cierre de sesión, usuario actual y alta de jugadores por invitación."""

import logging
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Request, Response
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.api.deps import (
    AnyUser,
    CurrentUser,
    HeadCoach,
    SessionDep,
    SettingsDep,
    require_trusted_origin,
    unauthorized,
)
from app.api.envelope import Envelope, ok
from app.api.errors import ApiError
from app.auth.invitations import hash_invitation_token
from app.auth.passwords import (
    hash_password_async,
    needs_rehash,
    spend_verification_time_async,
    verify_password_async,
)
from app.auth.rate_limit import (
    WINDOW,
    LoginKeys,
    client_ip,
    invitation_ip_key,
    invitation_is_blocked,
    is_blocked,
    login_keys,
)
from app.auth.refresh_flow import rotate_refresh_token
from app.auth.tokens import TokenError, TokenType, create_token, decode_token
from app.config import Settings
from app.db.invitations_repo import claim_invitation, player_has_user
from app.db.login_failures_repo import clear_failures, count_failures_since, record_failures
from app.db.models import User
from app.db.refresh_sessions_repo import (
    Rotation,
    create_session,
    delete_expired,
    revoke,
    revoke_all_for_user,
)
from app.db.users_repo import (
    WeakPasswordError,
    add_user,
    get_user,
    get_user_by_email,
    validate_password,
)
from app.domain.auth_sessions import RevokeReason
from app.domain.roles import Role
from app.schemas.auth import (
    DisplayNameUpdate,
    InvitationAccept,
    LoginData,
    LoginRequest,
    SessionsRevoked,
    TokenData,
    UserOut,
)

REFRESH_COOKIE = "refresh_token"
SECONDS_PER_DAY = 86400

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


def _request_ip(request: Request, settings: Settings) -> str:
    socket_host = request.client.host if request.client else None
    return client_ip(socket_host, request.headers, behind_vercel=settings.vercel)


def _login_keys(request: Request, email: str, settings: Settings) -> LoginKeys:
    return login_keys(_request_ip(request, settings), email, settings.require_jwt_secret())


def _too_many_attempts() -> ApiError:
    return ApiError(
        429,
        "too_many_attempts",
        "Demasiados intentos fallidos. Inténtalo más tarde",
        {"Retry-After": str(int(WINDOW.total_seconds()))},
    )


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
        raise _too_many_attempts()
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


def _invalid_invitation() -> ApiError:
    # Mismo mensaje para un token desconocido, usado o caducado: no se revela cuál de ellos es.
    return ApiError(400, "invalid_invitation", "La invitación no es válida o ha caducado")


def _email_taken() -> ApiError:
    return ApiError(409, "email_taken", "Ya existe una cuenta con ese email")


async def _failed_invitation(session: SessionDep, key: str, now: datetime) -> ApiError:
    """Anota el token inválido de esta IP y lo confirma ya: el 400 que sigue no debe deshacerlo."""
    await record_failures(session, (key,), now, forget_before=now - WINDOW)
    await session.commit()
    return _invalid_invitation()


@router.post(
    "/invitations/accept",
    response_model=Envelope[UserOut],
    status_code=201,
    dependencies=[Depends(require_trusted_origin)],
)
async def accept_invitation(
    payload: InvitationAccept, request: Request, session: SessionDep, settings: SettingsDep
) -> Envelope[UserOut]:
    """Crea la cuenta de jugador de una invitación vigente y la gasta en la misma transacción.

    Los tokens inválidos cuentan por IP: superado el límite se responde 429 sin mirar el token.
    El token se comprueba antes que el email: sin una invitación válida no se puede averiguar
    qué emails tienen cuenta. Si algo falla después, el rollback deja la invitación sin usar.
    """
    key = invitation_ip_key(_request_ip(request, settings), settings.require_jwt_secret())
    now = datetime.now(UTC)
    counts = await count_failures_since(session, (key,), now - WINDOW)
    if invitation_is_blocked(key, counts):
        raise _too_many_attempts()
    try:
        validate_password(payload.password)
    except WeakPasswordError as error:
        raise ApiError(422, "weak_password", str(error)) from error
    # Argon2 antes de reclamar: el bloqueo de fila de la invitación no espera al hash.
    password_hash = await hash_password_async(payload.password)
    invitation = await claim_invitation(session, hash_invitation_token(payload.token), now)
    if invitation is None:
        raise await _failed_invitation(session, key, now)
    if await get_user_by_email(session, payload.email) is not None:
        await session.rollback()
        raise _email_taken()
    if await player_has_user(session, invitation.player_id):
        await session.rollback()
        raise _invalid_invitation()
    try:
        user = await add_user(
            session, payload.email, password_hash, Role.PLAYER, invitation.player_id
        )
    except IntegrityError as error:
        # Carrera con otra alta del mismo email (o del mismo jugador) que se confirmó antes.
        await session.rollback()
        raise _email_taken() from error
    await session.commit()
    return ok(UserOut.model_validate(user))


@router.get("/me", response_model=Envelope[UserOut])
async def me(user: AnyUser) -> Envelope[UserOut]:
    return ok(UserOut.model_validate(user))


@router.patch("/me", response_model=Envelope[UserOut])
async def update_me(
    payload: DisplayNameUpdate, user: CurrentUser, session: SessionDep
) -> Envelope[UserOut]:
    """Pone o quita el nombre visible. Solo el personal técnico: un jugador usa el de su ficha."""
    user.display_name = payload.display_name
    await session.commit()
    return ok(UserOut.model_validate(user))


@router.delete("/users/{user_id}/sessions", response_model=Envelope[SessionsRevoked])
async def revoke_user_sessions(
    user_id: uuid.UUID, _: HeadCoach, session: SessionDep
) -> Envelope[SessionsRevoked]:
    """Cierra todas las sesiones de refresco de un usuario (iPad perdido). Solo el entrenador
    principal.

    Los tokens de acceso ya emitidos siguen valiendo hasta que caducan (minutos), salvo que el
    usuario esté desactivado: `is_active` se relee en cada petición y entonces dejan de valer ya.
    Dar de baja a un jugador (`DELETE /players/{id}`) desactiva su cuenta y cierra sus sesiones.
    """
    if await get_user(session, user_id) is None:
        raise ApiError(404, "not_found", "Usuario no encontrado")
    revoked = await revoke_all_for_user(session, user_id, datetime.now(UTC))
    await session.commit()
    return ok(SessionsRevoked(revoked=revoked))
