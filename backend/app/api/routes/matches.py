"""Partidos y exclusiones (sanciones confirmadas por el entrenador)."""

import uuid

from fastapi import APIRouter

from app.api.deps import AnyUser, CurrentUser, HeadCoach, SessionDep
from app.api.envelope import Envelope, Meta, ok
from app.api.errors import ApiError
from app.api.idempotency import IdempotencyKey, run_idempotent
from app.db import points_repo
from app.db.models import Match, Player
from app.schemas.points import (
    ExclusionCreate,
    ExclusionOut,
    MatchCreate,
    MatchMvpIn,
    MatchOut,
    MatchUpdate,
)

router = APIRouter(tags=["matches"])


def _not_found(what: str) -> ApiError:
    return ApiError(404, "not_found", f"{what} no encontrado")


def _match_out(match: Match, held_on: object) -> MatchOut:
    return MatchOut.model_validate(
        {
            "id": match.id,
            "session_id": match.session_id,
            "held_on": held_on,
            "opponent": match.opponent,
            "is_official": match.is_official,
            "mvp_player_id": match.mvp_player_id,
        }
    )


@router.post("/matches", response_model=Envelope[MatchOut], status_code=201)
async def create_match(
    payload: MatchCreate, db: SessionDep, user: CurrentUser, key: IdempotencyKey
) -> Envelope[MatchOut]:
    async def action() -> MatchOut:
        match = await points_repo.create_match(
            db, payload.held_on, payload.opponent, is_official=payload.is_official
        )
        return _match_out(match, payload.held_on)

    return await run_idempotent(db, key, user, "POST /matches", payload, MatchOut, action)


@router.get("/matches", response_model=Envelope[list[MatchOut]])
async def list_matches(db: SessionDep, _: AnyUser) -> Envelope[list[MatchOut]]:
    rows = await points_repo.list_matches(db)
    return ok([_match_out(m, held_on) for m, held_on in rows], Meta(total=len(rows)))


@router.patch("/matches/{match_id}", response_model=Envelope[MatchOut])
async def update_match(
    match_id: uuid.UUID, payload: MatchUpdate, db: SessionDep, _: CurrentUser
) -> Envelope[MatchOut]:
    """Marca un partido como oficial (jornada del Fantasy) o amistoso."""
    match = await points_repo.get_match(db, match_id)
    if match is None:
        raise _not_found("Partido")
    match.is_official = payload.is_official
    await db.flush()
    held_on = await points_repo.match_date(db, match)
    await db.commit()
    return ok(_match_out(match, held_on))


@router.put("/matches/{match_id}/mvp", response_model=Envelope[MatchOut])
async def set_mvp(
    match_id: uuid.UUID, payload: MatchMvpIn, db: SessionDep, _: CurrentUser
) -> Envelope[MatchOut]:
    """Elige (o quita, con null) el MVP del partido: suma puntos en el Fantasy si jugó."""
    match = await points_repo.get_match(db, match_id)
    if match is None:
        raise _not_found("Partido")
    if payload.player_id is not None and await db.get(Player, payload.player_id) is None:
        raise _not_found("Jugador")
    match.mvp_player_id = payload.player_id
    await db.flush()
    held_on = await points_repo.match_date(db, match)
    await db.commit()
    return ok(_match_out(match, held_on))


@router.post("/exclusions", response_model=Envelope[ExclusionOut], status_code=201)
async def create_exclusion(
    payload: ExclusionCreate, db: SessionDep, _: HeadCoach
) -> Envelope[ExclusionOut]:
    if await points_repo.find_missing_players(db, [payload.player_id]):
        raise _not_found("Jugador")
    if await points_repo.get_match(db, payload.match_id) is None:
        raise _not_found("Partido")
    try:
        exclusion = await points_repo.create_exclusion(
            db, payload.player_id, payload.match_id, payload.kind
        )
    except points_repo.DuplicateExclusionError as error:
        raise ApiError(409, "conflict", "El jugador ya tiene esa exclusión") from error
    await db.commit()
    return ok(ExclusionOut.model_validate(exclusion))


@router.get("/exclusions", response_model=Envelope[list[ExclusionOut]])
async def list_exclusions(
    match_id: uuid.UUID, db: SessionDep, _: HeadCoach
) -> Envelope[list[ExclusionOut]]:
    rows = await points_repo.list_exclusions(db, match_id)
    return ok([ExclusionOut.model_validate(r) for r in rows], Meta(total=len(rows)))


@router.delete("/exclusions/{exclusion_id}", response_model=Envelope[ExclusionOut])
async def delete_exclusion(
    exclusion_id: uuid.UUID, db: SessionDep, _: HeadCoach
) -> Envelope[ExclusionOut]:
    row = await points_repo.get_exclusion(db, exclusion_id)
    if row is None:
        raise _not_found("Exclusión")
    deleted = ExclusionOut.model_validate(row)
    await points_repo.delete_row(db, row)
    await db.commit()
    return ok(deleted)
