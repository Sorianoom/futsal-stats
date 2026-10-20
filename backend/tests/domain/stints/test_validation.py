import pytest

from app.domain.stints.models import Stint
from app.domain.stints.validation import (
    StintValidationError,
    find_overlaps,
    validate_stints,
)


def test_no_overlap_when_stints_touch_at_the_boundary() -> None:
    stints = [Stint("p1", 1, 0, 300), Stint("p1", 1, 300, 600)]

    assert find_overlaps(stints) == ()


def test_detects_overlap_for_same_player_and_part() -> None:
    first, second = Stint("p1", 1, 0, 400), Stint("p1", 1, 300, 600)

    overlaps = find_overlaps([second, first])

    assert len(overlaps) == 1
    assert overlaps[0].player_id == "p1"
    assert {overlaps[0].first, overlaps[0].second} == {first, second}


def test_same_seconds_in_different_parts_do_not_overlap() -> None:
    stints = [Stint("p1", 1, 0, 600), Stint("p1", 2, 0, 600)]

    assert find_overlaps(stints) == ()


def test_different_players_never_overlap() -> None:
    stints = [Stint("p1", 1, 0, 600), Stint("p2", 1, 0, 600)]

    assert find_overlaps(stints) == ()


def test_validate_accepts_clean_stints() -> None:
    validate_stints([Stint("p1", 1, 0, 300), Stint("p1", 1, 400, 600)])


def test_validate_rejects_overlaps() -> None:
    with pytest.raises(StintValidationError, match="solapa"):
        validate_stints([Stint("p1", 1, 0, 400), Stint("p1", 1, 300, 600)])


def test_validate_rejects_empty_or_reversed_stint() -> None:
    with pytest.raises(StintValidationError, match="fin"):
        validate_stints([Stint("p1", 1, 300, 300)])


def test_validate_rejects_negative_start() -> None:
    with pytest.raises(StintValidationError, match="inicio"):
        validate_stints([Stint("p1", 1, -1, 300)])


def test_validate_rejects_unknown_part() -> None:
    with pytest.raises(StintValidationError, match="parte"):
        validate_stints([Stint("p1", 3, 0, 300)])


def test_validate_reports_every_problem() -> None:
    with pytest.raises(StintValidationError) as error:
        validate_stints([Stint("p1", 3, 0, 300), Stint("p2", 1, 500, 100)])

    assert len(error.value.problems) == 2


def test_six_players_on_court_at_the_same_time_is_rejected() -> None:
    stints = [Stint(f"p{n}", 1, 0, 600) for n in range(1, 6)] + [Stint("p6", 1, 300, 400)]

    with pytest.raises(StintValidationError, match="a la vez"):
        validate_stints(stints)


def test_five_at_once_and_replacements_are_fine() -> None:
    stints = [Stint(f"p{n}", 1, 0, 600) for n in range(1, 5)]
    stints += [Stint("p5", 1, 0, 300), Stint("p6", 1, 300, 600)]

    validate_stints(stints)


def test_the_limit_is_checked_per_part() -> None:
    first = [Stint(f"p{n}", 1, 0, 600) for n in range(1, 6)]
    second = [Stint(f"p{n}", 2, 0, 600) for n in range(1, 6)]

    validate_stints(first + second)


def test_the_message_says_when_and_where_there_are_too_many() -> None:
    stints = [Stint(f"p{n}", 2, 0, 600) for n in range(1, 6)] + [Stint("p6", 2, 100, 200)]

    with pytest.raises(StintValidationError) as caught:
        validate_stints(stints)

    assert "parte 2" in str(caught.value)
    assert "6 jugadores" in str(caught.value)
