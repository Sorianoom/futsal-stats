"""Plantilla: lectura para ambos roles, escritura solo para el entrenador."""

import uuid

from fastapi import APIRouter

from app.api.deps import CurrentUser, HeadCoach, SessionDep
from app.api.envelope import Envelope, Meta, ok
from app.api.errors import ApiError
from app.db import players_repo
from app.db.models import Player
from app.schemas.players import PlayerCreate, PlayerOut, PlayerUpdate

router = APIRouter(prefix="/players", tags=["players"])


def _not_found() -> ApiError:
    return ApiError(404, "not_found", "Jugador no encontrado")


def _duplicate_dorsal() -> ApiError:
    return ApiError(409, "conflict", "Ya existe un jugador con ese dorsal")


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
    return ok([PlayerOut.model_validate(p) for p in players], Meta(total=len(players)))


@router.get("/{player_id}", response_model=Envelope[PlayerOut])
async def get_player(
    player_id: uuid.UUID, session: SessionDep, _: CurrentUser
) -> Envelope[PlayerOut]:
    return ok(PlayerOut.model_validate(await _existing(session, player_id)))


@router.post("", response_model=Envelope[PlayerOut], status_code=201)
async def create_player(
    payload: PlayerCreate, session: SessionDep, _: HeadCoach
) -> Envelope[PlayerOut]:
    try:
        player = await players_repo.create_player(session, payload.model_dump())
    except players_repo.DuplicateDorsalError as error:
        raise _duplicate_dorsal() from error
    await session.commit()
    return ok(PlayerOut.model_validate(player))


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
    return ok(PlayerOut.model_validate(player))


@router.delete("/{player_id}", response_model=Envelope[PlayerOut])
async def deactivate_player(
    player_id: uuid.UUID, session: SessionDep, _: HeadCoach
) -> Envelope[PlayerOut]:
    player = await _existing(session, player_id)
    await players_repo.update_player(session, player, {"is_active": False})
    await session.commit()
    return ok(PlayerOut.model_validate(player))
