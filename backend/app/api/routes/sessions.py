"""Sesiones (entrenos, partidos, fisio), asistencia con faltas propuestas y puntos de entreno."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import HeadCoach, SessionDep
from app.api.envelope import Envelope, Meta, ok
from app.api.errors import ApiError
from app.api.mappers import sanction_out
from app.db import points_repo
from app.db.catalog_repo import load_attendance_rules, load_catalog
from app.db.models import TeamSession
from app.domain.points.attendance import AttendanceRecord, propose_for_attendance
from app.domain.points.training import award_wins
from app.schemas.points import (
    AttendanceProposalOut,
    AttendanceRecordOut,
    AttendanceSave,
    AttendanceSaved,
    MovementOut,
    MovementsCreated,
    SessionCreate,
    SessionOut,
    WeekStart,
    WinsIn,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])


async def _existing_session(db: SessionDep, session_id: uuid.UUID) -> TeamSession:
    team_session = await points_repo.get_session_row(db, session_id)
    if team_session is None:
        raise ApiError(404, "not_found", "Sesión no encontrada")
    return team_session


async def _require_players(db: SessionDep, player_ids: list[uuid.UUID]) -> None:
    if await points_repo.find_missing_players(db, player_ids):
        raise ApiError(404, "not_found", "Jugador no encontrado")


@router.post("", response_model=Envelope[SessionOut], status_code=201)
async def create_session(
    payload: SessionCreate, db: SessionDep, _: HeadCoach
) -> Envelope[SessionOut]:
    row = await points_repo.create_session(db, payload.kind, payload.held_on, payload.notes)
    await db.commit()
    return ok(SessionOut.model_validate(row))


@router.get("", response_model=Envelope[list[SessionOut]])
async def list_sessions(
    db: SessionDep, _: HeadCoach, week: Annotated[WeekStart, Query()]
) -> Envelope[list[SessionOut]]:
    rows = await points_repo.list_sessions(db, week)
    return ok([SessionOut.model_validate(r) for r in rows], Meta(total=len(rows)))


@router.put("/{session_id}/attendance", response_model=Envelope[AttendanceSaved])
async def save_attendance(
    session_id: uuid.UUID, payload: AttendanceSave, db: SessionDep, _: HeadCoach
) -> Envelope[AttendanceSaved]:
    team_session = await _existing_session(db, session_id)
    await _require_players(db, [r.player_id for r in payload.records])
    await points_repo.save_attendance(
        db,
        session_id,
        [(r.player_id, r.status, r.notified, r.minutes_late) for r in payload.records],
    )
    await db.commit()

    catalog, rules = await load_catalog(db), await load_attendance_rules(db)
    proposals = []
    for record in payload.records:
        attendance = AttendanceRecord(
            str(record.player_id),
            team_session.kind,
            record.status,
            record.notified,
            record.minutes_late,
        )
        proposal = propose_for_attendance(attendance, catalog, rules)
        if proposal is not None:
            infraction = catalog[proposal.infraction_code]
            proposals.append(
                AttendanceProposalOut(
                    player_id=record.player_id,
                    infraction_code=infraction.code,
                    description=infraction.description,
                    points=infraction.points,
                    sanction=sanction_out(proposal.sanction),
                )
            )
    return ok(AttendanceSaved(saved=len(payload.records), proposals=proposals))


@router.get("/{session_id}/attendance", response_model=Envelope[list[AttendanceRecordOut]])
async def get_attendance(
    session_id: uuid.UUID, db: SessionDep, _: HeadCoach
) -> Envelope[list[AttendanceRecordOut]]:
    await _existing_session(db, session_id)
    rows = await points_repo.list_attendance(db, session_id)
    return ok([AttendanceRecordOut.model_validate(r) for r in rows])


@router.post("/{session_id}/wins", response_model=Envelope[MovementsCreated], status_code=201)
async def register_wins(
    session_id: uuid.UUID, payload: WinsIn, db: SessionDep, head_coach: HeadCoach
) -> Envelope[MovementsCreated]:
    team_session = await _existing_session(db, session_id)
    await _require_players(db, payload.player_ids)
    movements = award_wins(
        [str(pid) for pid in payload.player_ids],
        payload.kind,
        team_session.held_on,
        str(session_id),
    )
    rows = await points_repo.add_movements(db, movements, head_coach.id)
    await db.commit()
    return ok(MovementsCreated(movements=[MovementOut.model_validate(r) for r in rows]))
