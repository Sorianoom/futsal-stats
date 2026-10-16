"""Libro de movimientos semanal. Cada lunes todos parten de 20 puntos."""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date

from app.domain.points.catalog import Deferral, Infraction
from app.domain.points.weeks import next_week_start, week_start

BASE_POINTS = 20
MONDAY = 0


@dataclass(frozen=True, slots=True)
class Movement:
    player_id: str
    occurred_on: date
    points: int
    reason: str
    applies_week: date
    session_id: str | None = None
    infraction_code: str | None = None

    def __post_init__(self) -> None:
        if self.applies_week.weekday() != MONDAY:
            raise ValueError(f"applies_week debe ser un lunes: {self.applies_week}")


@dataclass(frozen=True, slots=True)
class Breakdown:
    player_id: str
    week: date
    base: int
    items: tuple[Movement, ...]

    @property
    def total(self) -> int:
        return self.base + sum(item.points for item in self.items)


def _applies_in_next_week(infraction: Infraction, in_match: bool) -> bool:
    if infraction.deferral is Deferral.NEXT_WEEK:
        return True
    return infraction.deferral is Deferral.NEXT_WEEK_IF_IN_MATCH and in_match


def movement_for_infraction(
    player_id: str,
    occurred_on: date,
    infraction: Infraction,
    *,
    session_id: str | None = None,
    in_match: bool = False,
    reason: str | None = None,
) -> Movement:
    applies = (
        next_week_start(occurred_on)
        if _applies_in_next_week(infraction, in_match)
        else week_start(occurred_on)
    )
    return Movement(
        player_id=player_id,
        occurred_on=occurred_on,
        points=infraction.points,
        reason=reason or infraction.description,
        applies_week=applies,
        session_id=session_id,
        infraction_code=infraction.code,
    )


def weekly_breakdown(player_id: str, week: date, movements: Iterable[Movement]) -> Breakdown:
    items = sorted(
        (m for m in movements if m.player_id == player_id and m.applies_week == week),
        key=lambda m: m.occurred_on,
    )
    return Breakdown(player_id, week, BASE_POINTS, tuple(items))


def weekly_balance(player_id: str, week: date, movements: Iterable[Movement]) -> int:
    return weekly_breakdown(player_id, week, movements).total
