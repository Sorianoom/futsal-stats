"""Nota y goles de cada jugador en un partido, a partir de sus tramos y eventos.

Lo usan las estadísticas del partido y el Fantasy, para que la nota se calcule en un solo sitio.
"""

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass

from app.domain.rating.score import RatingInput, player_rating
from app.domain.stints.events import (
    EventKind,
    MatchEvent,
    counts_by_player,
    effective_events,
)
from app.domain.stints.models import Stint
from app.domain.stints.stats import (
    GoalEvent,
    build_segments,
    has_segment,
    on_court_goals_by_player,
    seconds_by_player,
)


@dataclass(frozen=True, slots=True)
class PlayerMatchResult:
    """Nota del jugador (None si no la tiene) y goles que marcó."""

    rating: float | None
    goals: int


def goal_events(events: Iterable[MatchEvent]) -> list[GoalEvent]:
    """Goles a favor y en contra de una lista de eventos ya efectivos (sin los anulados)."""
    return [
        GoalEvent(e.part, e.t, for_team=e.kind is EventKind.GOAL)
        for e in events
        if e.kind in (EventKind.GOAL, EventKind.RIVAL_GOAL)
    ]


def rating_input(
    *,
    is_goalkeeper: bool,
    seconds: int,
    counts: Mapping[EventKind, int],
    on_court: tuple[int, int],
) -> RatingInput:
    """Entrada de la nota. Los tiros ya son tiros sin gol: el gol no genera un evento de tiro."""
    goals_for, goals_against = on_court
    return RatingInput(
        is_goalkeeper=is_goalkeeper,
        seconds=seconds,
        goals=counts.get(EventKind.GOAL, 0),
        assists=counts.get(EventKind.ASSIST, 0),
        shots=counts.get(EventKind.SHOT, 0),
        steals=counts.get(EventKind.STEAL, 0),
        turnovers=counts.get(EventKind.TURNOVER, 0),
        fouls=counts.get(EventKind.FOUL, 0),
        yellows=counts.get(EventKind.YELLOW, 0),
        reds=counts.get(EventKind.RED, 0),
        saves=counts.get(EventKind.SAVE, 0),
        goals_for_on_court=goals_for,
        goals_against_on_court=goals_against,
    )


def match_results(
    stints: Sequence[Stint], raw_events: Sequence[MatchEvent], goalkeeper_ids: set[str]
) -> dict[str, PlayerMatchResult]:
    """Nota y goles de cada jugador con tramos o eventos. Sin tramos (partido sin cerrar) no hay
    nota. Lanza `EventError` si el registro de eventos no es coherente."""
    counts = counts_by_player(raw_events)
    seconds = seconds_by_player(stints)
    segments = build_segments(stints)
    goals = [
        g for g in goal_events(effective_events(raw_events)) if has_segment(segments, g.part, g.t)
    ]
    on_court = on_court_goals_by_player(segments, goals)
    results = {}
    for player_id in set(seconds) | set(counts):
        player_counts = counts.get(player_id, {})
        rating = (
            player_rating(
                rating_input(
                    is_goalkeeper=player_id in goalkeeper_ids,
                    seconds=seconds.get(player_id, 0),
                    counts=player_counts,
                    on_court=on_court.get(player_id, (0, 0)),
                )
            )
            if segments
            else None
        )
        results[player_id] = PlayerMatchResult(rating, player_counts.get(EventKind.GOAL, 0))
    return results
