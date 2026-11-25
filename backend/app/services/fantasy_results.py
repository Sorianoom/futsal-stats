"""Fantasy: jornadas de la liga y resultados (nota y goles) de las que ya puntúan.

Módulo base que comparten la consulta de puntos y el cierre de jornada (sin ciclos entre ellos).
"""

import logging
import uuid
from collections.abc import Iterable, Sequence
from dataclasses import replace
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import fantasy_repo, match_repo
from app.db.models import FantasyLeague, Match
from app.domain.fantasy.calendar import Round, is_locked, league_rounds
from app.domain.fantasy.scoring import result_points
from app.domain.rating.match import PlayerMatchResult, match_results
from app.domain.stints.events import EventError

logger = logging.getLogger(__name__)

type Results = dict[str, dict[str, PlayerMatchResult]]


async def rounds_of(db: AsyncSession, league: FantasyLeague) -> list[Round]:
    """Jornadas de la liga: partidos oficiales desde su inicio, por fecha."""
    matches = await fantasy_repo.scheduled_matches(db, league.starts_on)
    return league_rounds(matches, league.starts_on)


async def _mvps(db: AsyncSession, match_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, str]:
    """MVP elegido de cada partido (los que no tienen, fuera)."""
    if not match_ids:
        return {}
    query = select(Match.id, Match.mvp_player_id).where(
        Match.id.in_(match_ids), Match.mvp_player_id.is_not(None)
    )
    return {match_id: str(mvp) for match_id, mvp in (await db.execute(query)).all()}


def _with_mvp(
    players: dict[str, PlayerMatchResult], mvp: str | None
) -> dict[str, PlayerMatchResult]:
    result = players.get(mvp) if mvp is not None else None
    if mvp is None or result is None:
        return players
    return {**players, mvp: replace(result, mvp=True)}


async def scored_results(db: AsyncSession, rounds: Sequence[Round], now: datetime) -> Results:
    """Nota y goles por jugador de las jornadas que ya puntúan: bloqueadas y con el partido
    cerrado. Un partido con eventos incoherentes queda pendiente (se registra el aviso)."""
    locked = [uuid.UUID(r.match_id) for r in rounds if is_locked(r, now)]
    stints = await match_repo.stints_by_match(db, locked)
    events = await match_repo.events_by_match(db, stints)
    involved = {s.player_id for match in stints.values() for s in match}
    involved |= {e.player_id for match in events.values() for e in match if e.player_id}
    goalkeepers = await fantasy_repo.goalkeeper_ids(db, involved)
    mvps = await _mvps(db, list(stints))
    results: Results = {}
    for match_id, match_stints in stints.items():
        try:
            players = match_results(match_stints, events.get(match_id, []), goalkeepers)
            results[str(match_id)] = _with_mvp(players, mvps.get(match_id))
        except EventError:
            logger.warning("Partido %s con eventos incoherentes: la jornada no puntúa", match_id)
    return results


# Jornadas que enseña la forma reciente de un jugador (las barritas del mercado y la plantilla).
RECENT_ROUNDS = 5


async def recent_points(
    db: AsyncSession, rounds: Sequence[Round], now: datetime, player_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, list[int]]:
    """Puntos de cada jugador en las últimas RECENT_ROUNDS jornadas que ya puntúan, de la más
    antigua a la más reciente (0 si no jugó). Sin capitán: son los del jugador. Informativo, se
    calcula al momento."""
    locked = sorted((r for r in rounds if is_locked(r, now)), key=lambda r: r.held_on)
    results = await scored_results(db, locked, now)
    scored = [results[r.match_id] for r in locked if r.match_id in results][-RECENT_ROUNDS:]
    out: dict[uuid.UUID, list[int]] = {}
    for player_id in player_ids:
        key = str(player_id)
        out[player_id] = [result_points(r) if (r := round_.get(key)) else 0 for round_ in scored]
    return out
