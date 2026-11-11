"""Jornadas del Fantasy: bloqueo a las 00:00 de Madrid y jornadas de la liga."""

from datetime import UTC, date, datetime

from app.domain.fantasy.calendar import (
    Round,
    RoundStatus,
    ScheduledMatch,
    is_locked,
    league_rounds,
    lock_time,
    madrid_date,
    next_open_round,
    round_status,
    visible_rounds,
)


def _round(day: int, match_id: str | None = None) -> Round:
    return Round(match_id=match_id or f"m{day}", opponent="Rival", held_on=date(2026, 11, day))


def test_lock_time_is_midnight_in_madrid_in_winter() -> None:
    assert lock_time(date(2026, 11, 15)) == datetime(2026, 11, 14, 23, 0, tzinfo=UTC)


def test_lock_time_is_midnight_in_madrid_in_summer() -> None:
    assert lock_time(date(2026, 10, 17)) == datetime(2026, 10, 16, 22, 0, tzinfo=UTC)


def test_madrid_date_changes_at_madrid_midnight() -> None:
    assert madrid_date(datetime(2026, 10, 16, 21, 59, tzinfo=UTC)) == date(2026, 10, 16)
    assert madrid_date(datetime(2026, 10, 16, 22, 0, tzinfo=UTC)) == date(2026, 10, 17)


def test_a_round_is_locked_from_its_lock_time_on() -> None:
    round_ = _round(15)

    assert not is_locked(round_, datetime(2026, 11, 14, 22, 59, 59, tzinfo=UTC))
    assert is_locked(round_, datetime(2026, 11, 14, 23, 0, tzinfo=UTC))


def test_league_rounds_are_official_matches_from_the_league_start_in_date_order() -> None:
    matches = [
        ScheduledMatch("late", "C", date(2026, 11, 22), is_official=True),
        ScheduledMatch("friendly", "B", date(2026, 11, 15), is_official=False),
        ScheduledMatch("early", "A", date(2026, 11, 8), is_official=True),
        ScheduledMatch("before", "Z", date(2026, 11, 1), is_official=True),
        ScheduledMatch("start", "Y", date(2026, 11, 3), is_official=True),
    ]

    rounds = league_rounds(matches, starts_on=date(2026, 11, 3))

    assert [r.match_id for r in rounds] == ["start", "early", "late"]


def test_next_open_round_is_the_first_not_locked() -> None:
    rounds = [_round(8), _round(15), _round(22)]

    assert next_open_round(rounds, datetime(2026, 11, 10, tzinfo=UTC)) == rounds[1]
    assert next_open_round(rounds, datetime(2026, 11, 23, tzinfo=UTC)) is None


def test_visible_rounds_are_the_locked_ones_and_the_next() -> None:
    rounds = [_round(8), _round(15), _round(22)]

    visible = visible_rounds(rounds, datetime(2026, 11, 10, tzinfo=UTC))

    assert visible == rounds[:2]


def test_round_status_is_scored_only_when_locked_and_closed() -> None:
    round_ = _round(15)
    before = datetime(2026, 11, 10, tzinfo=UTC)
    after = datetime(2026, 11, 16, tzinfo=UTC)

    assert round_status(round_, after, closed=True) is RoundStatus.SCORED
    assert round_status(round_, after, closed=False) is RoundStatus.PENDING
    assert round_status(round_, before, closed=True) is RoundStatus.PENDING
