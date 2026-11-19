"""Fantasy: crear la liga, entrar en ella (con el alta tardía) y la alineación.

Sin cron: lo pendiente (copias de jugadores nuevos, alta de usuarios nuevos, ventas vencidas,
jornadas por cerrar y el mercado de hoy) se pone al día en la siguiente petición del Fantasy.
"""

import random
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import fantasy_money_repo, fantasy_repo
from app.db.models import FantasyLeague, FantasyParticipant, User
from app.domain.fantasy.calendar import madrid_date
from app.domain.fantasy.copies import deal_copies, missing_copies
from app.domain.fantasy.lineup import Lineup, build_lineup
from app.domain.fantasy.rules import INITIAL_BALANCE, INITIAL_FIELD_COPIES
from app.domain.fantasy.standings import display_name
from app.schemas.fantasy import LeagueCreatedOut, LineupOut
from app.services.fantasy_processing import catch_up

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
    """Jugadores activos sin copias (altas posteriores): sus copias van a la banca y empiezan
    con el valor inicial."""
    missing = await _missing(db, league_id)
    if missing:
        await fantasy_repo.add_copies(db, league_id, missing)
        await fantasy_money_repo.add_player_values(db, league_id, [pid for pid, _ in missing])


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
    """Liga activa y participante del usuario, tras poner al día todo lo pendiente (el alta y
    luego lo vencido del mercado y las jornadas)."""
    membership = await _join(db, user, now, rng)
    if membership is None:
        return None
    if not await catch_up(db, now, rng):
        return membership
    participant = await fantasy_repo.get_participant(db, membership.league.id, user.id)
    assert participant is not None
    return Membership(membership.league, participant)


async def _join(
    db: AsyncSession, user: User, now: datetime, rng: random.Random
) -> Membership | None:
    """Liga activa y participante del usuario, con el alta tardía y las copias nuevas.

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


async def participant_names(db: AsyncSession, league_id: uuid.UUID) -> dict[uuid.UUID, str]:
    """Nombre visible de cada participante de la liga."""
    return {
        p.participant.id: display_name(p.user_name, p.player_name, p.email)
        for p in await fantasy_repo.list_participants(db, league_id)
    }


def lineup_out(lineup: Lineup) -> LineupOut:
    return LineupOut(
        goalkeeper_copy_id=_uuid_or_none(lineup.goalkeeper),
        field_copy_ids=[_uuid_or_none(c) for c in lineup.field],
        captain_copy_id=_uuid_or_none(lineup.captain),
    )


def _uuid_or_none(value: str | None) -> uuid.UUID | None:
    return uuid.UUID(value) if value is not None else None


async def save_lineup(
    db: AsyncSession,
    user: User,
    now: datetime,
    rng: random.Random,
    goalkeeper: str | None,
    field: Sequence[str | None],
    captain: str | None = None,
) -> Lineup:
    """Guarda una alineación nueva, que vale para la siguiente jornada no bloqueada.

    Lanza `NoLeagueError` sin liga y `LineupError` si no es válida para su plantilla.
    """
    membership = await require_membership(db, user, now, rng)
    participant_id = membership.participant.id
    squad = {
        str(c.copy.id): c.player.position for c in await fantasy_repo.squad(db, participant_id)
    }
    lineup = build_lineup(goalkeeper, field, squad, captain)
    await fantasy_repo.save_lineup(db, participant_id, lineup, now)
    await db.commit()
    return lineup
