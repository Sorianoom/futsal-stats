"""Fantasy: puntos por jornada, clasificación y detalle de mi jornada.

Los puntos no se guardan: se calculan en cada consulta a partir de las notas, como la nota misma.
Cambiar los pesos de la nota recalcula también el Fantasy.
"""

import logging
import random
import uuid
from collections.abc import Iterable, Mapping, Sequence
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import fantasy_repo, match_repo
from app.db.models import User
from app.domain.fantasy.calendar import (
    Round,
    RoundStatus,
    is_locked,
    lock_time,
    visible_rounds,
)
from app.domain.fantasy.lineup import SavedLineup, latest_lineup, lineup_in_force
from app.domain.fantasy.scoring import SlotScore, score_lineup
from app.domain.fantasy.standings import StandingRow, display_name, rank
from app.domain.rating.match import PlayerMatchResult, match_results
from app.domain.stints.events import EventError
from app.schemas.fantasy import RoundDetailOut, RoundOut, SlotOut, StandingRowOut, StandingsOut
from app.services.fantasy import NoLeagueError, enter, require_membership, rounds_of

logger = logging.getLogger(__name__)

type Results = dict[str, dict[str, PlayerMatchResult]]


class NotARoundError(Exception):
    """El partido no es una jornada de la liga (amistoso, anterior a la liga o inexistente)."""


async def _scored_results(db: AsyncSession, rounds: Sequence[Round], now: datetime) -> Results:
    """Nota y goles por jugador de las jornadas que ya puntúan: bloqueadas y con el partido
    cerrado. Un partido con eventos incoherentes queda pendiente (se registra el aviso)."""
    locked = [uuid.UUID(r.match_id) for r in rounds if is_locked(r, now)]
    stints = await match_repo.stints_by_match(db, locked)
    events = await match_repo.events_by_match(db, stints)
    involved = {s.player_id for match in stints.values() for s in match}
    involved |= {e.player_id for match in events.values() for e in match if e.player_id}
    goalkeepers = await fantasy_repo.goalkeeper_ids(db, involved)
    results: Results = {}
    for match_id, match_stints in stints.items():
        try:
            results[str(match_id)] = match_results(
                match_stints, events.get(match_id, []), goalkeepers
            )
        except EventError:
            logger.warning("Partido %s con eventos incoherentes: la jornada no puntúa", match_id)
    return results


def _status(round_: Round, results: Results) -> RoundStatus:
    return RoundStatus.SCORED if round_.match_id in results else RoundStatus.PENDING


async def _copy_players(db: AsyncSession, copy_ids: Iterable[str]) -> dict[str, str]:
    copies = await fantasy_repo.copies_with_players(db, copy_ids)
    return {copy_id: str(player.id) for copy_id, (_, player) in copies.items()}


def _round_points(
    history: Sequence[SavedLineup],
    round_: Round,
    copy_players: Mapping[str, str],
    results: Results,
) -> int:
    lineup = lineup_in_force(history, lock_time(round_.held_on))
    return sum(s.points for s in score_lineup(lineup, copy_players, results[round_.match_id]))


async def standings(
    db: AsyncSession, user: User, now: datetime, rng: random.Random
) -> StandingsOut:
    """Jornadas bloqueadas y la próxima, y la suma de puntos de las puntuadas por participante."""
    membership = await enter(db, user, now, rng)
    if membership is None:
        return StandingsOut(rounds=[], rows=[])
    rounds = visible_rounds(await rounds_of(db, membership.league), now)
    results = await _scored_results(db, rounds, now)
    scored = [r for r in rounds if r.match_id in results]
    participants = await fantasy_repo.list_participants(db, membership.league.id)
    histories = await fantasy_repo.lineup_history(db, [p.participant.id for p in participants])
    copy_ids = {
        c
        for history in histories.values()
        for r in scored
        for c in lineup_in_force(history, lock_time(r.held_on)).copy_ids()
    }
    copy_players = await _copy_players(db, copy_ids)
    rows = [
        StandingRow(
            participant_id=str(p.participant.id),
            display_name=display_name(p.player_name, p.email),
            points_by_round={
                r.match_id: _round_points(
                    histories.get(p.participant.id, []), r, copy_players, results
                )
                for r in scored
            },
        )
        for p in participants
    ]
    return StandingsOut(
        rounds=[
            RoundOut(
                match_id=uuid.UUID(r.match_id),
                opponent=r.opponent,
                held_on=r.held_on,
                status=_status(r, results),
            )
            for r in rounds
        ],
        rows=[
            StandingRowOut(
                participant_id=uuid.UUID(row.participant_id),
                display_name=row.display_name,
                total=row.total,
                points_by_round=dict(row.points_by_round),
            )
            for row in rank(rows)
        ],
    )


async def my_round(
    db: AsyncSession, user: User, now: datetime, rng: random.Random, match_id: uuid.UUID
) -> RoundDetailOut:
    """Mi alineación de una jornada con la nota, los goles y los puntos de cada hueco.

    Si la jornada no está bloqueada todavía, muestra la alineación vigente (la que se usará).
    """
    try:
        membership = await require_membership(db, user, now, rng)
    except NoLeagueError as error:
        raise NotARoundError from error
    round_ = next(
        (r for r in await rounds_of(db, membership.league) if r.match_id == str(match_id)), None
    )
    if round_ is None:
        raise NotARoundError
    participant_id = membership.participant.id
    history = (await fantasy_repo.lineup_history(db, [participant_id])).get(participant_id, [])
    lineup = (
        lineup_in_force(history, lock_time(round_.held_on))
        if is_locked(round_, now)
        else latest_lineup(history)
    )
    results = await _scored_results(db, [round_], now)
    copies = await fantasy_repo.copies_with_players(db, lineup.copy_ids())
    copy_players = {copy_id: str(player.id) for copy_id, (_, player) in copies.items()}
    names = {str(player.id): player.name for _, player in copies.values()}
    slots = score_lineup(lineup, copy_players, results.get(round_.match_id, {}))
    return RoundDetailOut(
        match_id=match_id,
        status=_status(round_, results),
        total=sum(s.points for s in slots),
        slots=[_slot_out(s, names) for s in slots],
    )


def _slot_out(slot: SlotScore, names: Mapping[str, str]) -> SlotOut:
    return SlotOut(
        slot=slot.slot,
        copy_id=uuid.UUID(slot.copy_id) if slot.copy_id else None,
        player_id=uuid.UUID(slot.player_id) if slot.player_id else None,
        name=names.get(slot.player_id) if slot.player_id else None,
        rating=slot.rating,
        goals=slot.goals,
        points=slot.points,
    )
