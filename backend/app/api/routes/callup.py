"""Convocatoria semanal: ranking, titulares propuestos, empates y desglose de puntos."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import HeadCoach, SessionDep
from app.api.envelope import Envelope, ok
from app.api.errors import ApiError
from app.db import points_repo
from app.db.models import Player
from app.domain.points.callup import (
    CallupCandidate,
    CallupResult,
    Selection,
    generate_callup,
)
from app.schemas.points import (
    BreakdownItemOut,
    BreakdownOut,
    CallupOut,
    RankedPlayerOut,
    SelectionOut,
    WeekStart,
)

router = APIRouter(tags=["callup"])


def _selection_out(selection: Selection) -> SelectionOut:
    return SelectionOut(
        guaranteed=[uuid.UUID(pid) for pid in selection.guaranteed],
        tied=[uuid.UUID(pid) for pid in selection.tied],
        open_slots=selection.open_slots,
    )


def _callup_out(result: CallupResult, players: dict[str, Player]) -> CallupOut:
    ranking = [
        RankedPlayerOut(
            player_id=uuid.UUID(r.player_id),
            name=players[r.player_id].name,
            dorsal=r.dorsal,
            position=r.position,
            points=r.points,
            excluded=r.excluded,
        )
        for r in result.ranking
    ]
    breakdowns = {
        uuid.UUID(pid): BreakdownOut(
            base=b.base,
            total=b.total,
            items=[
                BreakdownItemOut(
                    occurred_on=m.occurred_on,
                    points=m.points,
                    reason=m.reason,
                    infraction_code=m.infraction_code,
                    session_id=m.session_id,
                )
                for m in b.items
            ],
        )
        for pid, b in result.breakdowns.items()
    }
    return CallupOut(
        week=result.week,
        ranking=ranking,
        field=_selection_out(result.field),
        goalkeepers=_selection_out(result.goalkeepers),
        starters=_selection_out(result.starters),
        breakdowns=breakdowns,
    )


@router.get("/callup", response_model=Envelope[CallupOut])
async def get_callup(
    db: SessionDep,
    _: HeadCoach,
    week: Annotated[WeekStart, Query()],
    match_id: uuid.UUID | None = None,
) -> Envelope[CallupOut]:
    exclusions = {}
    if match_id is not None:
        if await points_repo.get_match(db, match_id) is None:
            raise ApiError(404, "not_found", "Partido no encontrado")
        exclusions = await points_repo.exclusions_by_player(db, match_id)

    players = await points_repo.active_players(db)
    candidates = [CallupCandidate(str(p.id), p.position, p.status, p.dorsal) for p in players]
    movements = await points_repo.week_movements(db, week)
    result = generate_callup(candidates, movements, week, exclusions=exclusions)
    return ok(_callup_out(result, {str(p.id): p for p in players}))
