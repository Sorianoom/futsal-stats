import pytest

from app.domain.stints.models import Stint
from app.domain.stints.stats import (
    GoalEvent,
    LineupSegment,
    QuintetRating,
    StatsError,
    build_segments,
    quintet_stats,
    seconds_by_player,
)

QUINTET_A = frozenset({"p1", "p2", "p3", "p4", "p5"})
QUINTET_B = frozenset({"p6", "p2", "p3", "p4", "p5"})


def one_substitution_match() -> list[Stint]:
    """p1 juega 0-600 y p6 lo releva hasta 1200; el resto juega los 1200."""
    rest = [Stint(p, 1, 0, 1200) for p in ("p2", "p3", "p4", "p5")]
    return [Stint("p1", 1, 0, 600), Stint("p6", 1, 600, 1200), *rest]


def test_seconds_by_player_sums_all_stints() -> None:
    stints = [Stint("p1", 1, 0, 300), Stint("p1", 2, 100, 400), Stint("p2", 1, 0, 50)]

    assert seconds_by_player(stints) == {"p1": 600, "p2": 50}


def test_seconds_by_player_of_nothing_is_empty() -> None:
    assert seconds_by_player([]) == {}


def test_build_segments_splits_at_every_change() -> None:
    segments = build_segments(one_substitution_match())

    assert segments == (
        LineupSegment(1, 0, 600, QUINTET_A),
        LineupSegment(1, 600, 1200, QUINTET_B),
    )


def test_build_segments_orders_by_part_then_time() -> None:
    stints = [Stint("p1", 2, 0, 100), Stint("p1", 1, 0, 100)]

    assert [s.part for s in build_segments(stints)] == [1, 2]


def test_build_segments_merges_adjacent_segments_with_same_players() -> None:
    stints = [Stint("p1", 1, 0, 300), Stint("p1", 1, 300, 600)]

    assert build_segments(stints) == (LineupSegment(1, 0, 600, frozenset({"p1"})),)


def test_build_segments_skips_gaps_with_nobody_on_court() -> None:
    stints = [Stint("p1", 1, 0, 100), Stint("p1", 1, 200, 300)]

    assert [(s.start, s.end) for s in build_segments(stints)] == [(0, 100), (200, 300)]


def test_quintet_stats_accumulates_seconds_per_quintet() -> None:
    stats = quintet_stats(build_segments(one_substitution_match()), [], [])

    assert stats[QUINTET_A].seconds == 600
    assert stats[QUINTET_B].seconds == 600


def test_same_quintet_in_two_segments_adds_up() -> None:
    stints = [Stint("p1", 1, 0, 100), Stint("p1", 2, 0, 50)]

    stats = quintet_stats(build_segments(stints), [], [])

    assert stats[frozenset({"p1"})].seconds == 150


def test_goals_are_assigned_to_the_quintet_on_court() -> None:
    goals = [GoalEvent(1, 100, True), GoalEvent(1, 700, False), GoalEvent(1, 800, True)]

    stats = quintet_stats(build_segments(one_substitution_match()), goals, [])

    assert (stats[QUINTET_A].goals_for, stats[QUINTET_A].goals_against) == (1, 0)
    assert (stats[QUINTET_B].goals_for, stats[QUINTET_B].goals_against) == (1, 1)


def test_goal_at_the_change_second_belongs_to_the_incoming_quintet() -> None:
    stats = quintet_stats(build_segments(one_substitution_match()), [GoalEvent(1, 600, True)], [])

    assert stats[QUINTET_A].goals_for == 0
    assert stats[QUINTET_B].goals_for == 1


def test_goal_at_the_end_of_the_part_belongs_to_the_last_quintet() -> None:
    stats = quintet_stats(build_segments(one_substitution_match()), [GoalEvent(1, 1200, False)], [])

    assert stats[QUINTET_B].goals_against == 1


def test_goal_outside_any_segment_is_an_error() -> None:
    with pytest.raises(StatsError):
        quintet_stats(build_segments(one_substitution_match()), [GoalEvent(2, 10, True)], [])


def test_ratings_average_per_quintet() -> None:
    ratings = [QuintetRating(1, 100, 5), QuintetRating(1, 200, 3), QuintetRating(1, 900, 4)]

    stats = quintet_stats(build_segments(one_substitution_match()), [], ratings)

    assert stats[QUINTET_A].rating_count == 2
    assert stats[QUINTET_A].rating_average == 4.0
    assert stats[QUINTET_B].rating_average == 4.0


def test_rating_average_is_none_without_ratings() -> None:
    stats = quintet_stats(build_segments(one_substitution_match()), [], [])

    assert stats[QUINTET_A].rating_average is None


@pytest.mark.parametrize("stars", [0, 6, -1])
def test_rating_outside_one_to_five_stars_is_an_error(stars: int) -> None:
    with pytest.raises(StatsError):
        quintet_stats(build_segments(one_substitution_match()), [], [QuintetRating(1, 100, stars)])
