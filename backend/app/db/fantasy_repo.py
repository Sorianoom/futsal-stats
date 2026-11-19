"""Acceso a datos del Fantasy: liga, participantes, copias y alineaciones.

Las funciones hacen flush; el commit lo decide quien llama.
"""

import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import exists, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.db.models import (
    GOALKEEPER_SLOT,
    FantasyCopy,
    FantasyLeague,
    FantasyLineup,
    FantasyLineupSlot,
    FantasyListing,
    FantasyParticipant,
    FantasyPlayerValue,
    FantasyTransfer,
    Match,
    Player,
    TeamSession,
    User,
)
from app.domain.fantasy.calendar import ScheduledMatch
from app.domain.fantasy.clauses import initial_clause
from app.domain.fantasy.copies import FreeCopy
from app.domain.fantasy.lineup import Lineup, SavedLineup
from app.domain.fantasy.market import TransferKind
from app.domain.fantasy.rules import INITIAL_PLAYER_VALUE
from app.domain.points.callup import Position

ONE_ACTIVE_LEAGUE_INDEX = "ux_fantasy_leagues_one_active"


class LeagueExistsError(Exception):
    """Ya hay una liga activa."""


@dataclass(frozen=True, slots=True)
class ParticipantInfo:
    """Participante con lo necesario para mostrar su nombre."""

    participant: FantasyParticipant
    email: str
    player_name: str | None
    user_name: str | None


@dataclass(frozen=True, slots=True)
class SquadCopy:
    copy: FantasyCopy
    player: Player


# --- Liga y participantes ------------------------------------------------------------------------


async def get_active_league(db: AsyncSession, *, for_update: bool = False) -> FantasyLeague | None:
    """Liga activa. Con `for_update` bloquea su fila: todas las escrituras de mercado, saldo y
    cierre de jornada se serializan así (y se releen los datos frescos tras esperar)."""
    query = select(FantasyLeague).where(FantasyLeague.is_active.is_(True))
    if for_update:
        query = query.with_for_update().execution_options(populate_existing=True)
    return (await db.execute(query)).scalar_one_or_none()


async def set_market_day(db: AsyncSession, league: FantasyLeague, day: date) -> None:
    league.market_day = day
    await db.flush()


async def create_league(
    db: AsyncSession, starts_on: date, created_by: uuid.UUID, created_at: datetime
) -> FantasyLeague:
    """Crea la liga activa. El índice único parcial impide una segunda aunque lleguen a la vez."""
    league = FantasyLeague(starts_on=starts_on, created_by=created_by, created_at=created_at)
    try:
        async with db.begin_nested():
            db.add(league)
            await db.flush()
    except IntegrityError as error:
        if ONE_ACTIVE_LEAGUE_INDEX in str(error.orig):
            raise LeagueExistsError from error
        raise
    return league


async def active_user_ids(db: AsyncSession) -> list[uuid.UUID]:
    query = select(User.id).where(User.is_active.is_(True)).order_by(User.created_at, User.id)
    return list((await db.execute(query)).scalars().all())


async def get_participant(
    db: AsyncSession, league_id: uuid.UUID, user_id: uuid.UUID
) -> FantasyParticipant | None:
    query = (
        select(FantasyParticipant)
        .where(FantasyParticipant.league_id == league_id, FantasyParticipant.user_id == user_id)
        .execution_options(populate_existing=True)
    )
    return (await db.execute(query)).scalar_one_or_none()


async def add_participants(
    db: AsyncSession,
    league_id: uuid.UUID,
    user_ids: Iterable[uuid.UUID],
    balance: int,
    joined_at: datetime,
) -> list[FantasyParticipant]:
    rows = [
        FantasyParticipant(league_id=league_id, user_id=u, balance=balance, joined_at=joined_at)
        for u in user_ids
    ]
    db.add_all(rows)
    await db.flush()
    return rows


async def list_participants(db: AsyncSession, league_id: uuid.UUID) -> list[ParticipantInfo]:
    query = (
        select(FantasyParticipant, User.email, Player.name, User.display_name)
        .join(User, User.id == FantasyParticipant.user_id)
        .outerjoin(Player, Player.id == User.player_id)
        .where(FantasyParticipant.league_id == league_id)
        .execution_options(populate_existing=True)
    )
    rows = (await db.execute(query)).all()
    return [ParticipantInfo(p, email, name, user_name) for p, email, name, user_name in rows]


async def participant_info(db: AsyncSession, participant: FantasyParticipant) -> ParticipantInfo:
    query = (
        select(User.email, Player.name, User.display_name)
        .outerjoin(Player, Player.id == User.player_id)
        .where(User.id == participant.user_id)
    )
    email, name, user_name = (await db.execute(query)).one()
    return ParticipantInfo(participant, email, name, user_name)


# --- Copias --------------------------------------------------------------------------------------


async def active_players(db: AsyncSession) -> list[Player]:
    query = select(Player).where(Player.is_active.is_(True)).order_by(Player.dorsal)
    return list((await db.execute(query)).scalars().all())


async def players_with_copies(db: AsyncSession, league_id: uuid.UUID) -> set[str]:
    query = select(FantasyCopy.player_id).where(FantasyCopy.league_id == league_id).distinct()
    return {str(pid) for pid in (await db.execute(query)).scalars().all()}


async def add_copies(
    db: AsyncSession, league_id: uuid.UUID, copies: Sequence[tuple[str, int]]
) -> None:
    """Copias nuevas en la banca: (jugador, número de copia)."""
    db.add_all(
        FantasyCopy(league_id=league_id, player_id=uuid.UUID(pid), copy_number=number)
        for pid, number in copies
    )
    await db.flush()


def copy_is_listed() -> ColumnElement[bool]:
    """La copia de la fila tiene una venta abierta (de la banca o de un participante)."""
    return exists().where(
        FantasyListing.copy_id == FantasyCopy.id,
        FantasyListing.resolved_at.is_(None),
        FantasyListing.cancelled_at.is_(None),
    )


async def free_field_copies(db: AsyncSession, league_id: uuid.UUID) -> list[FreeCopy]:
    """Copias de la banca de jugadores de campo activos que no están en venta (las únicas que
    se reparten al entrar: una copia del mercado de la banca es de quien la gane)."""
    query = (
        select(FantasyCopy.id, FantasyCopy.player_id, FantasyCopy.copy_number)
        .join(Player, Player.id == FantasyCopy.player_id)
        .where(
            FantasyCopy.league_id == league_id,
            FantasyCopy.owner_id.is_(None),
            Player.is_active.is_(True),
            Player.position == Position.FIELD,
            ~copy_is_listed(),
        )
    )
    return [FreeCopy(str(c), str(p), n) for c, p, n in (await db.execute(query)).all()]


async def assign_copies(
    db: AsyncSession, owner_id: uuid.UUID, copy_ids: Iterable[str], acquired_at: datetime
) -> None:
    """Reparto inicial: las copias de la banca pasan al participante (con su traspaso)."""
    ids = [uuid.UUID(c) for c in copy_ids]
    if not ids:
        return
    query = select(FantasyCopy).where(FantasyCopy.id.in_(ids), FantasyCopy.owner_id.is_(None))
    copies = (await db.execute(query)).scalars().all()
    values = await _values_of(db, {c.league_id for c in copies}, {c.player_id for c in copies})
    for copy in copies:
        db.add(
            FantasyTransfer(
                league_id=copy.league_id,
                copy_id=copy.id,
                from_participant_id=None,
                to_participant_id=owner_id,
                price=0,
                kind=TransferKind.INITIAL,
                at=acquired_at,
            )
        )
        copy.owner_id, copy.acquired_at = owner_id, acquired_at
        copy.clause = initial_clause(values.get(copy.player_id, INITIAL_PLAYER_VALUE))
    await db.flush()


async def _values_of(
    db: AsyncSession, league_ids: set[uuid.UUID], player_ids: set[uuid.UUID]
) -> dict[uuid.UUID, int]:
    if not player_ids:
        return {}
    query = select(FantasyPlayerValue.player_id, FantasyPlayerValue.value).where(
        FantasyPlayerValue.league_id.in_(league_ids),
        FantasyPlayerValue.player_id.in_(player_ids),
    )
    return {pid: value for pid, value in (await db.execute(query)).all()}


async def squad(db: AsyncSession, participant_id: uuid.UUID) -> list[SquadCopy]:
    """Copias del participante: porteros primero y luego por dorsal."""
    query = (
        select(FantasyCopy, Player)
        .join(Player, Player.id == FantasyCopy.player_id)
        .where(FantasyCopy.owner_id == participant_id)
    )
    rows = [SquadCopy(c, p) for c, p in (await db.execute(query)).all()]
    return sorted(
        rows, key=lambda r: (r.player.position is not Position.GOALKEEPER, r.player.dorsal)
    )


async def copies_with_players(
    db: AsyncSession, copy_ids: Iterable[str]
) -> dict[str, tuple[FantasyCopy, Player]]:
    ids = [uuid.UUID(c) for c in set(copy_ids)]
    if not ids:
        return {}
    query = (
        select(FantasyCopy, Player)
        .join(Player, Player.id == FantasyCopy.player_id)
        .where(FantasyCopy.id.in_(ids))
    )
    return {str(c.id): (c, p) for c, p in (await db.execute(query)).all()}


# --- Alineaciones --------------------------------------------------------------------------------


def _lineup_from_slots(row: FantasyLineup, slots: Iterable[FantasyLineupSlot]) -> Lineup:
    by_slot = {s.slot: (str(s.copy_id) if s.copy_id else None) for s in slots}
    field_slots = sorted(n for n in by_slot if n != GOALKEEPER_SLOT)
    return Lineup(
        goalkeeper=by_slot.get(GOALKEEPER_SLOT),
        field=tuple(by_slot[n] for n in field_slots),
        captain=str(row.captain_copy_id) if row.captain_copy_id else None,
    )


async def lineup_history(
    db: AsyncSession, participant_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, list[SavedLineup]]:
    """Todas las alineaciones guardadas de los participantes, de la más antigua a la última."""
    ids = list(set(participant_ids))
    if not ids:
        return {}
    query = (
        select(FantasyLineup, FantasyLineupSlot)
        .join(FantasyLineupSlot, FantasyLineupSlot.lineup_id == FantasyLineup.id)
        .where(FantasyLineup.participant_id.in_(ids))
        .order_by(FantasyLineup.saved_at, FantasyLineup.id, FantasyLineupSlot.slot)
    )
    lineups: dict[uuid.UUID, FantasyLineup] = {}
    slots: dict[uuid.UUID, list[FantasyLineupSlot]] = {}
    for lineup, slot in (await db.execute(query)).all():
        lineups[lineup.id] = lineup
        slots.setdefault(lineup.id, []).append(slot)
    history: dict[uuid.UUID, list[SavedLineup]] = {}
    for lineup_id, lineup in lineups.items():
        saved = SavedLineup(lineup.saved_at, _lineup_from_slots(lineup, slots[lineup_id]))
        history.setdefault(lineup.participant_id, []).append(saved)
    return history


async def save_lineup(
    db: AsyncSession, participant_id: uuid.UUID, lineup: Lineup, saved_at: datetime
) -> None:
    """Guarda una versión nueva; las anteriores se conservan para las jornadas ya bloqueadas."""
    row = FantasyLineup(
        participant_id=participant_id,
        saved_at=saved_at,
        captain_copy_id=uuid.UUID(lineup.captain) if lineup.captain is not None else None,
    )
    db.add(row)
    await db.flush()
    db.add_all(
        FantasyLineupSlot(
            lineup_id=row.id,
            slot=index,
            copy_id=uuid.UUID(copy_id) if copy_id is not None else None,
        )
        for index, (_, copy_id) in enumerate(lineup.slots())
    )
    await db.flush()


# --- Partidos ------------------------------------------------------------------------------------


async def scheduled_matches(db: AsyncSession, since: date) -> list[ScheduledMatch]:
    """Partidos desde una fecha, oficiales o no (la regla de qué es jornada está en el dominio)."""
    query = (
        select(Match.id, Match.opponent, TeamSession.held_on, Match.is_official)
        .join(TeamSession, TeamSession.id == Match.session_id)
        .where(TeamSession.held_on >= since)
    )
    return [
        ScheduledMatch(str(mid), opponent, held_on, official)
        for mid, opponent, held_on, official in (await db.execute(query)).all()
    ]


async def goalkeeper_ids(db: AsyncSession, player_ids: Iterable[str]) -> set[str]:
    ids = [uuid.UUID(p) for p in set(player_ids)]
    if not ids:
        return set()
    query = select(Player.id).where(Player.id.in_(ids), Player.position == Position.GOALKEEPER)
    return {str(pid) for pid in (await db.execute(query)).scalars().all()}
