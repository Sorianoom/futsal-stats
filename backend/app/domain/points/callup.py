"""Convocatoria: top por puntos, empates en el corte para decisión del entrenador."""

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from enum import StrEnum

from app.domain.points.catalog import SanctionKind
from app.domain.points.ledger import Breakdown, Movement, weekly_breakdown


class Position(StrEnum):
    FIELD = "field"
    GOALKEEPER = "goalkeeper"


class PlayerStatus(StrEnum):
    AVAILABLE = "available"
    INJURED = "injured"


@dataclass(frozen=True, slots=True)
class CallupCandidate:
    player_id: str
    position: Position
    status: PlayerStatus
    dorsal: int


@dataclass(frozen=True, slots=True)
class CallupConfig:
    field_slots: int = 10
    goalkeeper_slots: int = 2
    starters: int = 4


@dataclass(frozen=True, slots=True)
class Selection:
    """`guaranteed` entra seguro; `tied` empatan en el corte y disputan `open_slots` plazas."""

    guaranteed: tuple[str, ...]
    tied: tuple[str, ...]
    open_slots: int

    @property
    def is_ambiguous(self) -> bool:
        return bool(self.tied)


@dataclass(frozen=True, slots=True)
class RankedPlayer:
    player_id: str
    position: Position
    dorsal: int
    points: int
    excluded: SanctionKind | None = None


@dataclass(frozen=True, slots=True)
class CallupResult:
    week: date
    ranking: tuple[RankedPlayer, ...]
    field: Selection
    goalkeepers: Selection
    starters: Selection
    breakdowns: Mapping[str, Breakdown]


def select_top(entries: Sequence[tuple[str, int]], slots: int) -> Selection:
    ordered = sorted(entries, key=lambda entry: -entry[1])
    if len(ordered) <= slots:
        return Selection(tuple(pid for pid, _ in ordered), (), slots - len(ordered))
    cut = ordered[slots - 1][1]
    above = tuple(pid for pid, points in ordered if points > cut)
    tied = tuple(pid for pid, points in ordered if points == cut)
    open_slots = slots - len(above)
    if len(tied) <= open_slots:
        return Selection(above + tied, (), 0)
    return Selection(above, tied, open_slots)


def _rank(
    candidates: Iterable[CallupCandidate],
    breakdowns: Mapping[str, Breakdown],
    exclusions: Mapping[str, SanctionKind],
) -> tuple[RankedPlayer, ...]:
    ranked = [
        RankedPlayer(
            c.player_id,
            c.position,
            c.dorsal,
            breakdowns[c.player_id].total,
            exclusions.get(c.player_id),
        )
        for c in candidates
    ]
    return tuple(sorted(ranked, key=lambda r: (-r.points, r.dorsal)))


def _select(ranking: Sequence[RankedPlayer], position: Position, slots: int) -> Selection:
    eligible = [
        (r.player_id, r.points) for r in ranking if r.position is position and not r.excluded
    ]
    return select_top(eligible, slots)


def generate_callup(
    candidates: Iterable[CallupCandidate],
    movements: Iterable[Movement],
    week: date,
    *,
    exclusions: Mapping[str, SanctionKind] | None = None,
    config: CallupConfig | None = None,
) -> CallupResult:
    settings = config or CallupConfig()
    available = [c for c in candidates if c.status is PlayerStatus.AVAILABLE]
    week_moves = list(movements)
    breakdowns = {c.player_id: weekly_breakdown(c.player_id, week, week_moves) for c in available}
    ranking = _rank(available, breakdowns, exclusions or {})

    field_selection = _select(ranking, Position.FIELD, settings.field_slots)
    called = set(field_selection.guaranteed + field_selection.tied)
    starters = select_top(
        [(r.player_id, r.points) for r in ranking if r.player_id in called], settings.starters
    )
    return CallupResult(
        week=week,
        ranking=ranking,
        field=field_selection,
        goalkeepers=_select(ranking, Position.GOALKEEPER, settings.goalkeeper_slots),
        starters=starters,
        breakdowns=breakdowns,
    )
