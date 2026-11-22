"""Cierre del partido (tramos desde la alineación) y edición manual de tramos."""

import uuid

from fastapi import APIRouter
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, HeadCoach, SessionDep
from app.api.envelope import Envelope, Meta, ok
from app.api.errors import ApiError
from app.db import match_repo, points_repo
from app.db.models import LineupEventRow, StintRow
from app.domain.roles import Role
from app.domain.stints.lineup import (
    LineupError,
    LineupRecord,
    parse_lineup_payload,
    replay_records,
)
from app.domain.stints.models import Stint
from app.domain.stints.stats import seconds_by_player
from app.domain.stints.validation import StintValidationError, validate_stints
from app.schemas.match_sync import (
    FinalizeResult,
    PlayerTransferIn,
    PlayerTransferOut,
    StintCreate,
    StintOut,
    StintUpdate,
)
from app.services import match_transfer

router = APIRouter(tags=["stints"])


def _not_found(what: str) -> ApiError:
    return ApiError(404, "not_found", f"{what} no encontrado")


def _invalid(message: str) -> ApiError:
    return ApiError(422, "validation_error", message)


def _to_lineup_record(row: LineupEventRow) -> LineupRecord:
    return LineupRecord(str(row.id), parse_lineup_payload(row.payload))


def _check_set(stints: list[Stint]) -> None:
    try:
        validate_stints(stints)
    except StintValidationError as error:
        raise _invalid(str(error)) from error


async def _require_match(db: SessionDep, match_id: uuid.UUID) -> None:
    if await points_repo.get_match(db, match_id) is None:
        raise _not_found("Partido")


async def _flush_or_conflict(db: SessionDep) -> None:
    try:
        await db.flush()
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(409, "conflict", "El tramo choca con otro de la base de datos") from error


@router.post("/matches/{match_id}/finalize", response_model=Envelope[FinalizeResult])
async def finalize_match(
    match_id: uuid.UUID, db: SessionDep, user: CurrentUser, force: bool = False
) -> Envelope[FinalizeResult]:
    if force and user.role is not Role.HEAD_COACH:
        raise ApiError(403, "forbidden", "Solo el entrenador puede rehacer el cierre")
    await _require_match(db, match_id)

    lineup_rows = await match_repo.list_lineup_events(db, match_id)
    if not lineup_rows:
        raise ApiError(409, "conflict", "El partido no tiene eventos de alineación")
    try:
        # Lo deshecho (cambios, rojas, fines o inicios de parte) no cuenta.
        state = replay_records(_to_lineup_record(row) for row in lineup_rows)
    except LineupError as error:
        raise _invalid(f"Alineación imposible: {error}") from error
    if state.current_part is not None:
        raise ApiError(409, "conflict", "Hay una parte sin cerrar")
    if await match_repo.list_stints(db, match_id) and not force:
        raise ApiError(409, "conflict", "El partido ya está cerrado; usa force para rehacerlo")

    rows = await match_repo.replace_stints(db, match_id, state.closed_stints)
    await db.commit()
    totals = seconds_by_player(state.closed_stints)
    return ok(
        FinalizeResult(
            stints=[StintOut.model_validate(r) for r in rows],
            seconds_by_player={uuid.UUID(pid): seconds for pid, seconds in totals.items()},
        )
    )


@router.get("/matches/{match_id}/stints", response_model=Envelope[list[StintOut]])
async def list_stints(
    match_id: uuid.UUID, db: SessionDep, _: CurrentUser
) -> Envelope[list[StintOut]]:
    await _require_match(db, match_id)
    rows = await match_repo.list_stints(db, match_id)
    return ok([StintOut.model_validate(r) for r in rows], Meta(total=len(rows)))


@router.post("/matches/{match_id}/stints", response_model=Envelope[StintOut], status_code=201)
async def create_stint(
    match_id: uuid.UUID, payload: StintCreate, db: SessionDep, _: HeadCoach
) -> Envelope[StintOut]:
    await _require_match(db, match_id)
    if await points_repo.find_missing_players(db, [payload.player_id]):
        raise _not_found("Jugador")
    existing = [match_repo.stint_to_domain(r) for r in await match_repo.list_stints(db, match_id)]
    candidate = Stint(str(payload.player_id), payload.part, payload.start_s, payload.end_s)
    _check_set([*existing, candidate])

    row = StintRow(
        match_id=match_id,
        player_id=payload.player_id,
        part=payload.part,
        start_s=payload.start_s,
        end_s=payload.end_s,
    )
    db.add(row)
    await _flush_or_conflict(db)
    await db.commit()
    return ok(StintOut.model_validate(row))


@router.patch("/stints/{stint_id}", response_model=Envelope[StintOut])
async def update_stint(
    stint_id: uuid.UUID, payload: StintUpdate, db: SessionDep, _: HeadCoach
) -> Envelope[StintOut]:
    row = await match_repo.get_stint(db, stint_id)
    if row is None:
        raise _not_found("Tramo")
    changes = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    updated = Stint(
        str(row.player_id),
        changes.get("part", row.part),
        changes.get("start_s", row.start_s),
        changes.get("end_s", row.end_s),
    )
    others = [
        match_repo.stint_to_domain(r)
        for r in await match_repo.list_stints(db, row.match_id)
        if r.id != row.id
    ]
    _check_set([*others, updated])

    row.part, row.start_s, row.end_s = updated.part, updated.start, updated.end
    await _flush_or_conflict(db)
    await db.commit()
    return ok(StintOut.model_validate(row))


@router.delete("/stints/{stint_id}", response_model=Envelope[StintOut])
async def delete_stint(stint_id: uuid.UUID, db: SessionDep, _: HeadCoach) -> Envelope[StintOut]:
    row = await match_repo.get_stint(db, stint_id)
    if row is None:
        raise _not_found("Tramo")
    deleted = StintOut.model_validate(row)
    await points_repo.delete_row(db, row)
    await db.commit()
    return ok(deleted)


@router.post("/matches/{match_id}/player-transfer", response_model=Envelope[PlayerTransferOut])
async def transfer_player(
    match_id: uuid.UUID, payload: PlayerTransferIn, db: SessionDep, _: CurrentUser
) -> Envelope[PlayerTransferOut]:
    """Pasa todo lo anotado de un jugador a otro en este partido (se apuntó a uno por otro)."""
    await _require_match(db, match_id)
    try:
        changed = await match_transfer.transfer_player(
            db, match_id, payload.from_player_id, payload.to_player_id
        )
    except match_transfer.TransferError as error:
        status = 404 if error.code == "not_found" else 409
        raise ApiError(status, error.code, str(error)) from error
    return ok(PlayerTransferOut(changed=changed))


@router.delete("/matches/{match_id}/stats", response_model=Envelope[PlayerTransferOut])
async def clear_match_stats(
    match_id: uuid.UUID, db: SessionDep, _: HeadCoach
) -> Envelope[PlayerTransferOut]:
    """Borra todas las estadísticas del partido (mal tomadas) para dejarlo como sin empezar."""
    await _require_match(db, match_id)
    return ok(PlayerTransferOut(changed=await match_transfer.clear_stats(db, match_id)))
