from datetime import date, timedelta

import pytest

from app.domain.points.rotation import DutyPlayer, duty_for_week, duty_schedule

FIRST = date(2026, 10, 12)
PLAYERS = [DutyPlayer("c", 10), DutyPlayer("a", 3), DutyPlayer("b", 7)]


def test_first_week_goes_to_the_lowest_dorsal() -> None:
    assert duty_for_week(PLAYERS, FIRST, FIRST) == "a"


def test_following_weeks_follow_dorsal_order_and_wrap_around() -> None:
    weeks = [FIRST + timedelta(weeks=i) for i in range(4)]

    owners = [duty_for_week(PLAYERS, FIRST, week) for week in weeks]

    assert owners == ["a", "b", "c", "a"]


def test_any_day_of_the_week_maps_to_that_week() -> None:
    assert duty_for_week(PLAYERS, FIRST, date(2026, 10, 18)) == "a"
    assert duty_for_week(PLAYERS, FIRST, date(2026, 10, 19)) == "b"


def test_week_before_the_start_is_an_error() -> None:
    with pytest.raises(ValueError, match="anterior"):
        duty_for_week(PLAYERS, FIRST, date(2026, 10, 5))


def test_nobody_to_assign_is_an_error() -> None:
    with pytest.raises(ValueError, match="jugadores"):
        duty_for_week([], FIRST, FIRST)


def test_schedule_lists_the_next_weeks() -> None:
    schedule = duty_schedule(PLAYERS, FIRST, FIRST, weeks=3)

    assert schedule == (
        (date(2026, 10, 12), "a"),
        (date(2026, 10, 19), "b"),
        (date(2026, 10, 26), "c"),
    )
