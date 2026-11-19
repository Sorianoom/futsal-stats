"""Plantilla: lectura para el personal técnico, escritura e invitaciones solo para el entrenador."""

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from fastapi import APIRouter, Request

from app.api.deps import CurrentUser, HeadCoach, SessionDep
from app.api.envelope import Envelope, Meta, ok
from app.api.errors import ApiError
from app.auth.invitations import hash_invitation_token, new_invitation_token
from app.db import invitations_repo, photos_repo, players_repo
from app.db.models import Player
from app.db.refresh_sessions_repo import revoke_all_for_user
from app.domain.photos import MAX_PHOTO_BYTES, is_valid_photo
from app.schemas.players import InvitationOut, PlayerCreate, PlayerOut, PlayerUpdate

router = APIRouter(prefix="/players", tags=["players"])


def _not_found() -> ApiError:
    return ApiError(404, "not_found", "Jugador no encontrado")


def _duplicate_dorsal() -> ApiError:
    return ApiError(409, "conflict", "Ya existe un jugador con ese dorsal")


async def _outs(session: SessionDep, players: Sequence[Player]) -> list[PlayerOut]:
    """Respuestas con `has_account` y `photo_url`, resueltos para todos en una consulta cada uno."""
    ids = [p.id for p in players]
    with_account = await invitations_repo.players_with_active_account(session, ids)
    photos = await photos_repo.photo_urls(session, ids)
    computed = {"has_account", "photo_url"}
    return [
        PlayerOut.model_validate(
            {
                **{f: getattr(p, f) for f in PlayerOut.model_fields if f not in computed},
                "has_account": p.id in with_account,
                "photo_url": photos.get(p.id),
            }
        )
        for p in players
    ]


async def _out(session: SessionDep, player: Player) -> PlayerOut:
    return (await _outs(session, [player]))[0]


async def _existing(session: SessionDep, player_id: uuid.UUID) -> Player:
    player = await players_repo.get_player(session, player_id)
    if player is None:
        raise _not_found()
    return player


@router.get("", response_model=Envelope[list[PlayerOut]])
async def list_players(
    session: SessionDep, _: CurrentUser, include_inactive: bool = False
) -> Envelope[list[PlayerOut]]:
    players = await players_repo.list_players(session, include_inactive)
    return ok(await _outs(session, players), Meta(total=len(players)))


@router.get("/{player_id}", response_model=Envelope[PlayerOut])
async def get_player(
    player_id: uuid.UUID, session: SessionDep, _: CurrentUser
) -> Envelope[PlayerOut]:
    return ok(await _out(session, await _existing(session, player_id)))


@router.post("", response_model=Envelope[PlayerOut], status_code=201)
async def create_player(
    payload: PlayerCreate, session: SessionDep, _: HeadCoach
) -> Envelope[PlayerOut]:
    try:
        player = await players_repo.create_player(session, payload.model_dump())
    except players_repo.DuplicateDorsalError as error:
        raise _duplicate_dorsal() from error
    await session.commit()
    return ok(await _out(session, player))


@router.patch("/{player_id}", response_model=Envelope[PlayerOut])
async def update_player(
    player_id: uuid.UUID, payload: PlayerUpdate, session: SessionDep, _: HeadCoach
) -> Envelope[PlayerOut]:
    player = await _existing(session, player_id)
    # Un `null` explícito solo significa algo para el alias (borrarlo); en el resto, no cambiar.
    changes = {
        k: v
        for k, v in payload.model_dump(exclude_unset=True).items()
        if v is not None or k == "alias"
    }
    try:
        await players_repo.update_player(session, player, changes)
    except players_repo.DuplicateDorsalError as error:
        raise _duplicate_dorsal() from error
    await session.commit()
    return ok(await _out(session, player))


@router.delete("/{player_id}", response_model=Envelope[PlayerOut])
async def deactivate_player(
    player_id: uuid.UUID, session: SessionDep, _: HeadCoach
) -> Envelope[PlayerOut]:
    """Baja del jugador. En la misma transacción cierra su cuenta: borra las invitaciones
    pendientes, desactiva el usuario vinculado y revoca todas sus sesiones de refresco.

    Las invitaciones se borran antes de buscar la cuenta: si un alta se estaba confirmando, el
    DELETE la espera y la búsqueda ya ve al usuario nuevo.
    """
    player = await _existing(session, player_id)
    await players_repo.update_player(session, player, {"is_active": False})
    await invitations_repo.delete_pending_invitations(session, player.id)
    user = await invitations_repo.deactivate_player_user(session, player.id)
    if user is not None:
        await revoke_all_for_user(session, user.id, datetime.now(UTC))
    await session.commit()
    return ok(await _out(session, player))


@router.post("/{player_id}/invitation", response_model=Envelope[InvitationOut], status_code=201)
async def create_invitation(
    player_id: uuid.UUID, session: SessionDep, head_coach: HeadCoach
) -> Envelope[InvitationOut]:
    """Invitación de un solo uso para que el jugador cree su cuenta. Anula las anteriores.

    El token solo viaja en esta respuesta; en la BD queda su hash.
    """
    player = await invitations_repo.lock_player(session, player_id)
    if player is None:
        raise _not_found()
    if not player.is_active:
        raise ApiError(409, "player_inactive", "El jugador está dado de baja")
    if await invitations_repo.player_has_user(session, player_id):
        raise ApiError(409, "already_has_account", "El jugador ya tiene una cuenta")
    token = new_invitation_token()
    invitation = await invitations_repo.create_invitation(
        session, player_id, head_coach.id, hash_invitation_token(token), datetime.now(UTC)
    )
    await session.commit()
    return ok(InvitationOut(token=token, expires_at=invitation.expires_at))


async def _photo_body(request: Request) -> tuple[bytes, str]:
    """Los bytes de la foto y su tipo, comprobados: tamaño, tipo admitido y firma del fichero."""
    declared = request.headers.get("Content-Length")
    if declared is not None and declared.isdigit() and int(declared) > MAX_PHOTO_BYTES:
        raise ApiError(413, "photo_too_big", "La foto es demasiado grande")
    content = await request.body()
    if len(content) > MAX_PHOTO_BYTES:
        raise ApiError(413, "photo_too_big", "La foto es demasiado grande")
    content_type = request.headers.get("Content-Type", "").split(";")[0].strip().lower()
    if not is_valid_photo(content, content_type):
        raise ApiError(422, "invalid_photo", "La foto tiene que ser una imagen JPEG, PNG o WebP")
    return content, content_type


@router.put("/{player_id}/photo", response_model=Envelope[PlayerOut])
async def put_photo(
    player_id: uuid.UUID, request: Request, session: SessionDep, _: HeadCoach
) -> Envelope[PlayerOut]:
    player = await _existing(session, player_id)
    content, content_type = await _photo_body(request)
    await photos_repo.save_photo(session, player.id, content, content_type)
    await session.commit()
    return ok(await _out(session, player))


@router.delete("/{player_id}/photo", response_model=Envelope[PlayerOut])
async def delete_photo(
    player_id: uuid.UUID, session: SessionDep, _: HeadCoach
) -> Envelope[PlayerOut]:
    player = await _existing(session, player_id)
    await photos_repo.delete_photo(session, player.id)
    await session.commit()
    return ok(await _out(session, player))
