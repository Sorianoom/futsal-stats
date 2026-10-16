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
