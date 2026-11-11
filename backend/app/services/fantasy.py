"""Fantasy: crear la liga, entrar en ella (con el alta tardía), mi equipo y la alineación.

Sin cron: lo pendiente (copias de jugadores nuevos, alta de usuarios nuevos) se pone al día en la
siguiente petición del Fantasy.
"""

import random
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import fantasy_repo
from app.db.models import FantasyLeague, FantasyParticipant, User
from app.domain.fantasy.calendar import (
    Round,
    league_rounds,
    lock_time,
    madrid_date,
    next_open_round,
)
from app.domain.fantasy.copies import deal_copies, missing_copies
from app.domain.fantasy.lineup import Lineup, build_lineup, latest_lineup
from app.domain.fantasy.rules import INITIAL_BALANCE, INITIAL_FIELD_COPIES, INITIAL_PLAYER_VALUE
from app.domain.fantasy.standings import display_name
from app.schemas.fantasy import (
    LeagueCreatedOut,
    LeagueOut,
    LineupOut,
    MyTeamOut,
    NextRoundOut,
    ParticipantOut,
    SquadCopyOut,
)

LeagueExistsError = fantasy_repo.LeagueExistsError


class NoLeagueError(Exception):
    """No hay ninguna liga activa."""


@dataclass(frozen=True, slots=True)
class Membership:
    league: FantasyLeague
    participant: FantasyParticipant


async def create_league(
    db: AsyncSession, user: User, now: datetime, rng: random.Random
) -> LeagueCreatedOut:
    """Liga con todos los usuarios activos: 20 M y 2 jugadores de campo al azar cada uno."""
    if await fantasy_repo.get_active_league(db) is not None:
        raise LeagueExistsError
    league = await fantasy_repo.create_league(db, madrid_date(now), user.id, now)
    await _add_missing_copies(db, league.id)
    user_ids = await fantasy_repo.active_user_ids(db)
    participants = await fantasy_repo.add_participants(
        db, league.id, user_ids, INITIAL_BALANCE, now
    )
    await _deal_initial_copies(db, league.id, participants, now, rng)
    await db.commit()
    return LeagueCreatedOut(id=league.id, starts_on=league.starts_on, participants=len(user_ids))


async def _missing(db: AsyncSession, league_id: uuid.UUID) -> list[tuple[str, int]]:
    players = await fantasy_repo.active_players(db)
    have = await fantasy_repo.players_with_copies(db, league_id)
    return missing_copies([(str(p.id), p.position) for p in players], have)


async def _add_missing_copies(db: AsyncSession, league_id: uuid.UUID) -> None:
    """Jugadores activos sin copias (altas posteriores): sus copias van a la banca."""
    missing = await _missing(db, league_id)
    if missing:
        await fantasy_repo.add_copies(db, league_id, missing)


async def _deal_initial_copies(
    db: AsyncSession,
    league_id: uuid.UUID,
    participants: Sequence[FantasyParticipant],
    now: datetime,
    rng: random.Random,
) -> None:
    free = await fantasy_repo.free_field_copies(db, league_id)
    recipients = [str(p.id) for p in participants]
    for participant_id, copy_ids in deal_copies(
        recipients, free, INITIAL_FIELD_COPIES, rng
    ).items():
        await fantasy_repo.assign_copies(db, uuid.UUID(participant_id), copy_ids, now)


async def enter(
    db: AsyncSession, user: User, now: datetime, rng: random.Random
) -> Membership | None:
    """Liga activa y participante del usuario, tras poner al día lo pendiente.

    Si falta algo, bloquea la fila de la liga para que dos peticiones a la vez no den de alta
    dos veces al mismo usuario ni dupliquen copias.
    """
    league = await fantasy_repo.get_active_league(db)
    if league is None:
        return None
    participant = await fantasy_repo.get_participant(db, league.id, user.id)
    if participant is not None and not await _missing(db, league.id):
        return Membership(league, participant)

    league = await fantasy_repo.get_active_league(db, for_update=True)
    if league is None:
        return None
    await _add_missing_copies(db, league.id)
    participant = await fantasy_repo.get_participant(db, league.id, user.id)
    if participant is None:
        [participant] = await fantasy_repo.add_participants(
            db, league.id, [user.id], INITIAL_BALANCE, now
        )
        await _deal_initial_copies(db, league.id, [participant], now, rng)
    await db.commit()
    return Membership(league, participant)


async def require_membership(
    db: AsyncSession, user: User, now: datetime, rng: random.Random
) -> Membership:
    membership = await enter(db, user, now, rng)
    if membership is None:
        raise NoLeagueError
    return membership


async def rounds_of(db: AsyncSession, league: FantasyLeague) -> list[Round]:
    """Jornadas de la liga: partidos oficiales desde su inicio, por fecha."""
    matches = await fantasy_repo.scheduled_matches(db, league.starts_on)
    return league_rounds(matches, league.starts_on)


def lineup_out(lineup: Lineup) -> LineupOut:
    return LineupOut(
        goalkeeper_copy_id=_uuid_or_none(lineup.goalkeeper),
        field_copy_ids=[_uuid_or_none(c) for c in lineup.field],
    )


def _uuid_or_none(value: str | None) -> uuid.UUID | None:
    return uuid.UUID(value) if value is not None else None


async def my_team(
    db: AsyncSession, user: User, now: datetime, rng: random.Random
) -> MyTeamOut | None:
    """Mi participante, plantilla, alineación vigente y siguiente jornada; None sin liga."""
    membership = await enter(db, user, now, rng)
    if membership is None:
        return None
    league, participant = membership.league, membership.participant
    copies = await fantasy_repo.squad(db, participant.id)
    history = await fantasy_repo.lineup_history(db, [participant.id])
    upcoming = next_open_round(await rounds_of(db, league), now)
    info = await fantasy_repo.participant_info(db, participant)
    return MyTeamOut(
        league=LeagueOut(id=league.id, starts_on=league.starts_on),
        me=ParticipantOut(
            participant_id=participant.id,
            display_name=display_name(info.player_name, info.email),
            balance=participant.balance,
        ),
        squad=[
            SquadCopyOut(
                copy_id=c.copy.id,
                player_id=c.player.id,
                name=c.player.name,
                dorsal=c.player.dorsal,
                position=c.player.position,
                value=INITIAL_PLAYER_VALUE,
            )
            for c in copies
        ],
        lineup=lineup_out(latest_lineup(history.get(participant.id, []))),
        next_round=(
            NextRoundOut(
                match_id=uuid.UUID(upcoming.match_id),
                opponent=upcoming.opponent,
                held_on=upcoming.held_on,
                locks_at=lock_time(upcoming.held_on),
            )
            if upcoming is not None
            else None
        ),
    )


async def save_lineup(
    db: AsyncSession,
    user: User,
    now: datetime,
    rng: random.Random,
    goalkeeper: str | None,
    field: Sequence[str | None],
) -> Lineup:
    """Guarda una alineación nueva, que vale para la siguiente jornada no bloqueada.

    Lanza `NoLeagueError` sin liga y `LineupError` si no es válida para su plantilla.
    """
    membership = await require_membership(db, user, now, rng)
    participant_id = membership.participant.id
    squad = {
        str(c.copy.id): c.player.position for c in await fantasy_repo.squad(db, participant_id)
    }
    lineup = build_lineup(goalkeeper, field, squad)
    await fantasy_repo.save_lineup(db, participant_id, lineup, now)
    await db.commit()
    return lineup
