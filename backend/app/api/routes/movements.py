"""Libro de movimientos: registro de faltas, consulta, corrección y catálogo."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import HeadCoach, SessionDep
from app.api.envelope import Envelope, Meta, ok
from app.api.errors import ApiError
from app.api.mappers import sanction_out
from app.db import points_repo
from app.db.catalog_repo import load_catalog
from app.domain.points.ledger import movement_for_infraction
from app.domain.points.rules import propose_escalations
from app.schemas.points import (
    EscalationOut,
    InfractionIn,
    InfractionOut,
    InfractionRegistered,
    MovementOut,
    WeekStart,
)

router = APIRouter(tags=["movements"])


def _not_found(what: str) -> ApiError:
    return ApiError(404, "not_found", f"{what} no encontrado")


@router.post(
    "/movements/infractions", response_model=Envelope[InfractionRegistered], status_code=201
)
async def register_infraction(
    payload: InfractionIn, db: SessionDep, head_coach: HeadCoach
) -> Envelope[InfractionRegistered]:
    catalog = await load_catalog(db)
    infraction = catalog.get(payload.infraction_code)
    if infraction is None:
        raise _not_found("Falta")
    if await points_repo.find_missing_players(db, [payload.player_id]):
        raise _not_found("Jugador")
    if payload.session_id and await points_repo.get_session_row(db, payload.session_id) is None:
        raise _not_found("Sesión")

    movement = movement_for_infraction(
        str(payload.player_id),
        payload.occurred_on,
        infraction,
        session_id=str(payload.session_id) if payload.session_id else None,
        in_match=payload.in_match,
        reason=payload.reason,
    )
    (row,) = await points_repo.add_movements(db, [movement], head_coach.id)
    await db.commit()

    week_moves = await points_repo.week_movements(db, movement.applies_week)
    escalations = propose_escalations(
        movement.player_id, movement.applies_week, week_moves, catalog
    )
    return ok(
        InfractionRegistered(
            movement=MovementOut.model_validate(row),
            escalations=[
                EscalationOut(
                    infraction_code=e.infraction_code, week=e.week, session_id=e.session_id
                )
                for e in escalations
            ],
            sanction=sanction_out(infraction.sanction),
        )
    )


@router.get("/movements", response_model=Envelope[list[MovementOut]])
async def list_movements(
    db: SessionDep,
    _: HeadCoach,
    week: Annotated[WeekStart, Query()],
    player_id: uuid.UUID | None = None,
) -> Envelope[list[MovementOut]]:
    rows = await points_repo.list_movement_rows(db, week, player_id)
    return ok([MovementOut.model_validate(r) for r in rows], Meta(total=len(rows)))


@router.delete("/movements/{movement_id}", response_model=Envelope[MovementOut])
async def delete_movement(
    movement_id: uuid.UUID, db: SessionDep, _: HeadCoach
) -> Envelope[MovementOut]:
    row = await points_repo.get_movement(db, movement_id)
    if row is None:
        raise _not_found("Movimiento")
    deleted = MovementOut.model_validate(row)
    await points_repo.delete_row(db, row)
    await db.commit()
    return ok(deleted)


@router.get("/catalog/infractions", response_model=Envelope[list[InfractionOut]])
async def list_catalog(db: SessionDep, _: HeadCoach) -> Envelope[list[InfractionOut]]:
    catalog = await load_catalog(db)
    items = [
        InfractionOut(
            code=i.code,
            severity=i.severity,
            points=i.points,
            description=i.description,
            deferral=i.deferral,
            sanction=sanction_out(i.sanction),
            in_pdf_letter=i.in_pdf_letter,
        )
        for i in sorted(catalog.values(), key=lambda i: i.code)
    ]
    return ok(items, Meta(total=len(items)))
