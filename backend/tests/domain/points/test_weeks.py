from datetime import date

import pytest

from app.domain.points.weeks import next_week_start, week_start


@pytest.mark.parametrize(
    ("day", "monday"),
    [
        (date(2026, 10, 12), date(2026, 10, 12)),  # lunes
        (date(2026, 10, 14), date(2026, 10, 12)),  # miércoles
        (date(2026, 10, 18), date(2026, 10, 12)),  # domingo
        (date(2026, 10, 19), date(2026, 10, 19)),  # lunes siguiente
        (date(2027, 1, 1), date(2026, 12, 28)),  # cruce de año
    ],
)
def test_week_starts_on_monday(day: date, monday: date) -> None:
    assert week_start(day) == monday


def test_next_week_start_is_the_following_monday() -> None:
    assert next_week_start(date(2026, 10, 18)) == date(2026, 10, 19)
    assert next_week_start(date(2026, 10, 19)) == date(2026, 10, 26)
