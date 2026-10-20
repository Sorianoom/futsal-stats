"""Estadísticas de un partido: minutos, acciones por jugador, quintetos y resumen de equipo."""

import uuid
from collections.abc import Iterable

from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import CurrentUser, SessionDep
from app.api.envelope import Envelope, ok
from app.api.errors import ApiError
from app.db import match_repo, points_repo
from app.db.models import MatchEvent as MatchEventRow
from app.db.models import Player, StintRow
from app.domain.stints.events import (
    EventError,
    EventKind,
    MatchEvent,
    counts_by_player,
    effective_events,
    team_fouls_by_part,
)
from app.domain.stints.models import VALID_PARTS, Stint
from app.domain.stints.stats import (
    GoalEvent,
    QuintetRating,
    build_segments,
    has_segment,
    quintet_stats,
    seconds_by_player,
)
from app.schemas.stats import (
    MatchStatsOut,
    PlayerStatsOut,
    QuintetStatsOut,
    ScoreOut,
    SeasonPlayerStatsOut,
    SeasonStatsOut,
    TeamFoulsOut,
)

router = APIRouter(prefix="/matches", tags=["stats"])
season_router = APIRouter(prefix="/stats", tags=["stats"])


def _domain_event(row: MatchEventRow) -> MatchEvent:
    return MatchEvent(
        id=str(row.id),
        kind=row.kind,
        part=row.part,
        t=row.t,
        player_id=str(row.player_id) if row.player_id else None,
        voids=str(row.voids_event_id) if row.voids_event_id else None,
    )


def _goals(events: Iterable[MatchEvent]) -> list[GoalEvent]:
    return [
        GoalEvent(e.part, e.t, for_team=e.kind is EventKind.GOAL)
        for e in events
        if e.kind in (EventKind.GOAL, EventKind.RIVAL_GOAL)
    ]


async def _player_rows(db: SessionDep, ids: set[str]) -> dict[str, Player]:
    query = select(Player).where(Player.id.in_([uuid.UUID(i) for i in ids]))
    return {str(p.id): p for p in (await db.execute(query)).scalars().all()}


def _warning(uncovered: int) -> list[str]:
    if uncovered == 0:
        return []
    noun = "evento" if uncovered == 1 else "eventos"
    return [f"{uncovered} {noun} fuera de los tramos no cuentan para los quintetos"]


@router.get("/{match_id}/stats", response_model=Envelope[MatchStatsOut])
async def match_stats(
    match_id: uuid.UUID, db: SessionDep, _: CurrentUser
) -> Envelope[MatchStatsOut]:
    if await points_repo.get_match(db, match_id) is None:
        raise ApiError(404, "not_found", "Partido no encontrado")

    stints: list[Stint] = [
        match_repo.stint_to_domain(r) for r in await match_repo.list_stints(db, match_id)
    ]
    raw_events = [_domain_event(r) for r in await match_repo.list_events(db, match_id)]
    try:
        events = effective_events(raw_events)
        counts = counts_by_player(raw_events)
        fouls = team_fouls_by_part(raw_events)
    except EventError as error:
        raise ApiError(409, "conflict", "El registro de eventos no es coherente") from error

    seconds = seconds_by_player(stints)
    goals = _goals(events)
    ratings = [
        QuintetRating(r.part, r.t, r.stars) for r in await match_repo.list_ratings(db, match_id)
    ]
    segments = build_segments(stints)
    covered_goals = [g for g in goals if has_segment(segments, g.part, g.t)]
    covered_ratings = [r for r in ratings if has_segment(segments, r.part, r.t)]
    uncovered = (len(goals) - len(covered_goals)) + (len(ratings) - len(covered_ratings))

    quintets = [
        QuintetStatsOut(
            player_ids=[uuid.UUID(p) for p in sorted(players)],
            seconds=stat.seconds,
            goals_for=stat.goals_for,
            goals_against=stat.goals_against,
            rating_count=stat.rating_count,
            rating_average=stat.rating_average,
        )
        for players, stat in quintet_stats(segments, covered_goals, covered_ratings).items()
    ]
    quintets.sort(key=lambda q: -q.seconds)

    rows = await _player_rows(db, set(seconds) | set(counts))
    players = [_player_stats(rows[pid], seconds.get(pid, 0), counts.get(pid, {})) for pid in rows]
    players.sort(key=lambda p: (-p.seconds, p.dorsal))

    return ok(
        MatchStatsOut(
            match_id=match_id,
            closed=bool(stints),
            score=ScoreOut(
                goals_for=sum(1 for g in goals if g.for_team),
                goals_against=sum(1 for g in goals if not g.for_team),
            ),
            team_fouls=[TeamFoulsOut(part=part, fouls=fouls.get(part, 0)) for part in VALID_PARTS],
            players=players,
            quintets=quintets,
            warnings=_warning(uncovered) if stints else [],
        )
    )


def _player_stats(player: Player, seconds: int, counts: dict[EventKind, int]) -> PlayerStatsOut:
    return PlayerStatsOut(
        player_id=player.id,
        name=player.name,
        dorsal=player.dorsal,
        seconds=seconds,
        goals=counts.get(EventKind.GOAL, 0),
        assists=counts.get(EventKind.ASSIST, 0),
        shots=counts.get(EventKind.SHOT, 0),
        turnovers=counts.get(EventKind.TURNOVER, 0),
        steals=counts.get(EventKind.STEAL, 0),
        fouls=counts.get(EventKind.FOUL, 0),
        yellows=counts.get(EventKind.YELLOW, 0),
        reds=counts.get(EventKind.RED, 0),
    )


def _kind_totals(
    counts: dict[str, dict[EventKind, int]], player_id: str, into: dict[EventKind, int]
) -> dict[EventKind, int]:
    return {
        kind: into.get(kind, 0) + counts.get(player_id, {}).get(kind, 0)
        for kind in set(into) | set(counts.get(player_id, {}))
    }


@season_router.get("/players", response_model=Envelope[SeasonStatsOut])
async def season_players(db: SessionDep, _: CurrentUser) -> Envelope[SeasonStatsOut]:
    stints_by_match: dict[uuid.UUID, list[Stint]] = {}
    for row in (await db.execute(select(StintRow))).scalars().all():
        stints_by_match.setdefault(row.match_id, []).append(match_repo.stint_to_domain(row))

    events_by_match: dict[uuid.UUID, list[MatchEvent]] = {}
    if stints_by_match:
        query = select(MatchEventRow).where(MatchEventRow.match_id.in_(list(stints_by_match)))
        for event_row in (await db.execute(query)).scalars().all():
            events_by_match.setdefault(event_row.match_id, []).append(_domain_event(event_row))

    seconds: dict[str, int] = {}
    played: dict[str, int] = {}
    totals: dict[str, dict[EventKind, int]] = {}
    skipped = 0
    for match_id, stints in stints_by_match.items():
        try:
            counts = counts_by_player(events_by_match.get(match_id, []))
        except EventError:
            skipped += 1
            continue
        for player_id, total in seconds_by_player(stints).items():
            seconds[player_id] = seconds.get(player_id, 0) + total
            played[player_id] = played.get(player_id, 0) + (1 if total > 0 else 0)
        for player_id in counts:
            totals[player_id] = _kind_totals(counts, player_id, totals.get(player_id, {}))

    rows = await _player_rows(db, set(seconds) | set(totals)) if (seconds or totals) else {}
    players = [
        SeasonPlayerStatsOut(
            **_player_stats(rows[pid], seconds.get(pid, 0), totals.get(pid, {})).model_dump(),
            matches_played=played.get(pid, 0),
        )
        for pid in rows
    ]
    players.sort(key=lambda p: (-p.seconds, p.dorsal))
    warnings = (
        [f"{skipped} partido(s) con eventos incoherentes no cuentan en el acumulado"]
        if skipped
        else []
    )
    return ok(
        SeasonStatsOut(matches=len(stints_by_match) - skipped, players=players, warnings=warnings)
    )
