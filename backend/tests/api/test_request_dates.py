import uuid
from collections.abc import Callable
from datetime import date, timedelta
from typing import Any

import pytest
from pydantic import TypeAdapter, ValidationError

from app.domain.points.attendance import SessionKind
from app.schemas.points import (
    MAX_DAYS_AHEAD,
    MIN_DATE,
    InfractionIn,
    MatchCreate,
    SessionCreate,
    WeekStart,
)

# Cada modelo de entrada con una fecha, para probar la misma regla en todos.
BUILDERS: dict[str, Callable[[date], Any]] = {
    "session": lambda day: SessionCreate(kind=SessionKind.TRAINING, held_on=day),
    "match": lambda day: MatchCreate(held_on=day, opponent="Rival FS"),
    "infraction": lambda day: InfractionIn(
        player_id=uuid.uuid4(), infraction_code="A1", occurred_on=day
    ),
}
ALL = pytest.mark.parametrize("build", BUILDERS.values(), ids=BUILDERS.keys())


@ALL
def test_todays_date_is_accepted(build: Callable[[date], Any]) -> None:
    build(date.today())


@ALL
def test_a_recent_fixed_date_is_accepted(build: Callable[[date], Any]) -> None:
    # La fecha que usan los tests de integración: no debe caducar con el tiempo.
    build(date(2026, 10, 14))


@ALL
def test_the_first_accepted_day_is_the_minimum(build: Callable[[date], Any]) -> None:
    build(MIN_DATE)


@ALL
@pytest.mark.parametrize("day", [date(1, 1, 1), date(1999, 12, 31), MIN_DATE - timedelta(days=1)])
def test_dates_before_the_club_existed_are_rejected(
    build: Callable[[date], Any], day: date
) -> None:
    with pytest.raises(ValidationError):
        build(day)


@ALL
def test_a_date_within_the_allowed_future_is_accepted(build: Callable[[date], Any]) -> None:
    build(date.today() + timedelta(days=MAX_DAYS_AHEAD - 2))


@ALL
@pytest.mark.parametrize("ahead", [MAX_DAYS_AHEAD + 2, 3650])
def test_dates_too_far_in_the_future_are_rejected(build: Callable[[date], Any], ahead: int) -> None:
    with pytest.raises(ValidationError):
        build(date.today() + timedelta(days=ahead))


@ALL
def test_the_maximum_possible_date_is_rejected(build: Callable[[date], Any]) -> None:
    with pytest.raises(ValidationError):
        build(date.max)


week = TypeAdapter(WeekStart)


def monday_of(day: date) -> date:
    return day - timedelta(days=day.weekday())


def test_a_recent_monday_is_a_valid_week() -> None:
    assert week.validate_python(date(2026, 10, 12)) == date(2026, 10, 12)


def test_a_week_still_has_to_start_on_a_monday() -> None:
    with pytest.raises(ValidationError, match="lunes"):
        week.validate_python(date(2026, 10, 14))


def test_a_monday_before_the_minimum_is_rejected() -> None:
    with pytest.raises(ValidationError):
        week.validate_python(date(2019, 12, 30))


def test_a_monday_far_in_the_future_is_rejected() -> None:
    far = monday_of(date.today() + timedelta(days=3650))

    with pytest.raises(ValidationError):
        week.validate_python(far)
