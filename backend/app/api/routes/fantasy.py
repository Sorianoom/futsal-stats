"""Fantasy del equipo (`docs/fantasy.md`): liga, mi equipo, alineación y clasificación.

Todas las rutas las usa cualquier usuario activo (también los jugadores), salvo crear la liga,
que es del entrenador principal. El mercado está en `fantasy_market.py`.
"""

import uuid

from fastapi import APIRouter

from app.api.deps import AnyUser, HeadCoach, NowDep, RngDep, SessionDep
from app.api.envelope import Envelope, ok
from app.api.errors import ApiError
from app.domain.fantasy.lineup import LineupError
from app.schemas.fantasy import (
    LeagueCreatedOut,
    LineupIn,
    LineupOut,
    MyTeamOut,
    NoLeagueOut,
    ParticipantTeamOut,
    RoundDetailOut,
    SpectatorOut,
    StandingsOut,
)
from app.services import fantasy, fantasy_rivals, fantasy_scoring, fantasy_team

router = APIRouter(prefix="/fantasy", tags=["fantasy"])


def _no_league() -> ApiError:
    return ApiError(404, "not_found", "No hay ninguna liga activa")


@router.post("/league", response_model=Envelope[LeagueCreatedOut], status_code=201)
async def create_league(
    db: SessionDep, user: HeadCoach, now: NowDep, rng: RngDep
) -> Envelope[LeagueCreatedOut]:
    try:
        return ok(await fantasy.create_league(db, user, now, rng))
    except fantasy.LeagueExistsError as error:
        raise ApiError(409, "league_exists", "Ya hay una liga activa") from error


@router.get("/me", response_model=Envelope[MyTeamOut | SpectatorOut | NoLeagueOut])
async def my_team(
    db: SessionDep, user: AnyUser, now: NowDep, rng: RngDep
) -> Envelope[MyTeamOut | SpectatorOut | NoLeagueOut]:
    team = await fantasy_team.my_team(db, user, now, rng)
    return ok(team if team is not None else NoLeagueOut())


@router.put("/lineup", response_model=Envelope[LineupOut])
async def save_lineup(
    payload: LineupIn, db: SessionDep, user: AnyUser, now: NowDep, rng: RngDep
) -> Envelope[LineupOut]:
    goalkeeper = str(payload.goalkeeper_copy_id) if payload.goalkeeper_copy_id else None
    field = [str(c) if c else None for c in payload.field_copy_ids]
    captain = str(payload.captain_copy_id) if payload.captain_copy_id else None
    try:
        lineup = await fantasy.save_lineup(db, user, now, rng, goalkeeper, field, captain)
    except fantasy.NoLeagueError as error:
        raise _no_league() from error
    except LineupError as error:
        raise ApiError(422, "invalid_lineup", str(error)) from error
    return ok(fantasy.lineup_out(lineup))


@router.get("/standings", response_model=Envelope[StandingsOut])
async def standings(
    db: SessionDep, user: AnyUser, now: NowDep, rng: RngDep
) -> Envelope[StandingsOut]:
    return ok(await fantasy_scoring.standings(db, user, now, rng))


@router.get("/rounds/{match_id}/me", response_model=Envelope[RoundDetailOut])
async def my_round(
    match_id: uuid.UUID, db: SessionDep, user: AnyUser, now: NowDep, rng: RngDep
) -> Envelope[RoundDetailOut]:
    try:
        return ok(await fantasy_scoring.my_round(db, user, now, rng, match_id))
    except fantasy_scoring.NotARoundError as error:
        raise ApiError(404, "not_found", "Jornada no encontrada") from error


@router.get("/participants/{participant_id}", response_model=Envelope[ParticipantTeamOut])
async def participant_team(
    participant_id: uuid.UUID, db: SessionDep, user: AnyUser, now: NowDep, rng: RngDep
) -> Envelope[ParticipantTeamOut]:
    try:
        return ok(await fantasy_rivals.participant_team(db, user, now, rng, participant_id))
    except fantasy_rivals.ParticipantNotFoundError as error:
        raise ApiError(404, "not_found", "Participante no encontrado") from error
