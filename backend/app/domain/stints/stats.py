"""Minutos por jugador y rendimiento de quintetos a partir de tramos cerrados.

Regla de asignación de eventos a un segmento: [inicio, fin). Un evento en el segundo exacto
de un cambio pertenece al quinteto que entra; uno en el último segundo de la parte pertenece
al último segmento.
"""

from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from app.domain.stints.models import Stint

MIN_STARS = 1
MAX_STARS = 5


class StatsError(ValueError):
    """Evento que no encaja con los tramos registrados."""


@dataclass(frozen=True, slots=True)
class LineupSegment:
    part: int
    start: int
    end: int
    players: frozenset[str]


@dataclass(frozen=True, slots=True)
class GoalEvent:
    part: int
    t: int
    for_team: bool


@dataclass(frozen=True, slots=True)
class QuintetRating:
    part: int
    t: int
    stars: int


@dataclass(frozen=True, slots=True)
class QuintetStats:
    seconds: int = 0
    goals_for: int = 0
    goals_against: int = 0
    rating_count: int = 0
    rating_total: int = 0

    @property
    def rating_average(self) -> float | None:
        if self.rating_count == 0:
            return None
        return self.rating_total / self.rating_count


def seconds_by_player(stints: Iterable[Stint]) -> dict[str, int]:
    totals: dict[str, int] = defaultdict(int)
    for stint in stints:
        totals[stint.player_id] += stint.seconds
    return dict(totals)


def _segments_of_part(part: int, stints: Sequence[Stint]) -> list[LineupSegment]:
    boundaries = sorted({b for s in stints for b in (s.start, s.end)})
    segments: list[LineupSegment] = []
    for begin, finish in zip(boundaries, boundaries[1:], strict=False):
        players = frozenset(s.player_id for s in stints if s.start <= begin and s.end >= finish)
        if not players:
            continue
        previous = segments[-1] if segments else None
        if previous and previous.end == begin and previous.players == players:
            segments[-1] = LineupSegment(part, previous.start, finish, players)
        else:
            segments.append(LineupSegment(part, begin, finish, players))
    return segments


def build_segments(stints: Iterable[Stint]) -> tuple[LineupSegment, ...]:
    by_part: dict[int, list[Stint]] = defaultdict(list)
    for stint in stints:
        by_part[stint.part].append(stint)
    return tuple(
        segment for part in sorted(by_part) for segment in _segments_of_part(part, by_part[part])
    )


def has_segment(segments: Sequence[LineupSegment], part: int, t: int) -> bool:
    """Si algún tramo cubre ese instante (misma regla que usa `quintet_stats` para asignar)."""
    try:
        _locate(segments, part, t)
    except StatsError:
        return False
    return True


def _locate(segments: Sequence[LineupSegment], part: int, t: int) -> LineupSegment:
    in_part = [s for s in segments if s.part == part]
    for segment in in_part:
        if segment.start <= t < segment.end:
            return segment
    closing = [s for s in in_part if s.end == t]
    if closing:
        return closing[-1]
    raise StatsError(f"Ningún tramo cubre la parte {part} en el segundo {t}")


def on_court_goals_by_player(
    segments: Sequence[LineupSegment], goals: Iterable[GoalEvent]
) -> dict[str, tuple[int, int]]:
    """Goles (a favor, en contra) con cada jugador en pista, con la misma regla que los quintetos.

    Solo aparecen los jugadores que estaban en pista en algún gol.
    """
    goals_for: dict[str, int] = defaultdict(int)
    goals_against: dict[str, int] = defaultdict(int)
    for goal in goals:
        target = goals_for if goal.for_team else goals_against
        for player in _locate(segments, goal.part, goal.t).players:
            target[player] += 1
    return {
        player: (goals_for.get(player, 0), goals_against.get(player, 0))
        for player in goals_for.keys() | goals_against.keys()
    }


def clean_streaks_by_player(
    segments: Sequence[LineupSegment], goals: Iterable[GoalEvent], block_seconds: int
) -> dict[str, int]:
    """Bloques completos de `block_seconds` en pista sin gol en contra, por jugador.

    Cada jugador acumula sus segundos en pista; un gol rival con él en pista (misma regla que
    los quintetos) cierra su racha y la pone a cero. El banquillo y el descanso no la cortan.
    """
    against: dict[LineupSegment, list[int]] = defaultdict(list)
    for goal in goals:
        if not goal.for_team:
            against[_locate(segments, goal.part, goal.t)].append(goal.t)
    running: dict[str, int] = defaultdict(int)
    blocks: dict[str, int] = defaultdict(int)
    for segment in sorted(segments, key=lambda s: (s.part, s.start)):
        since = segment.start
        for t in sorted(against.get(segment, [])):
            for player in segment.players:
                blocks[player] += (running[player] + t - since) // block_seconds
                running[player] = 0
            since = t
        for player in segment.players:
            running[player] += segment.end - since
    return {player: blocks[player] + total // block_seconds for player, total in running.items()}


def quintet_stats(
    segments: Sequence[LineupSegment],
    goals: Iterable[GoalEvent],
    ratings: Iterable[QuintetRating],
) -> dict[frozenset[str], QuintetStats]:
    seconds: dict[frozenset[str], int] = defaultdict(int)
    for segment in segments:
        seconds[segment.players] += segment.end - segment.start

    goals_for: dict[frozenset[str], int] = defaultdict(int)
    goals_against: dict[frozenset[str], int] = defaultdict(int)
    for goal in goals:
        target = goals_for if goal.for_team else goals_against
        target[_locate(segments, goal.part, goal.t).players] += 1

    stars: dict[frozenset[str], list[int]] = defaultdict(list)
    for rating in ratings:
        if not MIN_STARS <= rating.stars <= MAX_STARS:
            raise StatsError(f"Estrellas fuera de rango: {rating.stars}")
        stars[_locate(segments, rating.part, rating.t).players].append(rating.stars)

    return {
        players: QuintetStats(
            seconds=total,
            goals_for=goals_for.get(players, 0),
            goals_against=goals_against.get(players, 0),
            rating_count=len(stars.get(players, [])),
            rating_total=sum(stars.get(players, [])),
        )
        for players, total in seconds.items()
    }
