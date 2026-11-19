"""Puntos de un jugador alineado y de una alineación en una jornada."""

import pytest

from app.domain.fantasy.lineup import Lineup
from app.domain.fantasy.scoring import PlayerResult, player_points, score_lineup
from app.domain.points.callup import Position


@pytest.mark.parametrize(
    ("rating", "goals", "expected"),
    [
        (6.3, 0, 6),  # ejemplo del reglamento
        (9.3, 2, 13),  # ejemplo del reglamento
        (6.5, 0, 7),  # ,5 redondea hacia arriba
        (7.5, 1, 10),
        (6.4, 0, 6),
        (1.0, 0, 1),
        (10.0, 3, 16),
    ],
)
def test_player_points_round_the_rating_half_up_and_add_two_per_goal(
    rating: float, goals: int, expected: int
) -> None:
    assert player_points(rating, goals) == expected


def test_a_player_without_rating_scores_zero_even_with_goals() -> None:
    assert player_points(None, 0) == 0
    assert player_points(None, 2) == 0


def test_points_are_never_negative() -> None:
    assert player_points(-3.0, 0) == 0


def test_score_lineup_fills_the_five_slots_and_empty_slots_score_zero() -> None:
    lineup = Lineup(goalkeeper="c-gk", field=("c-a", None, "c-b", None))
    copy_players = {"c-gk": "p-gk", "c-a": "p-a", "c-b": "p-b"}
    results = {"p-gk": PlayerResult(7.5, 0), "p-a": PlayerResult(6.3, 1)}

    slots = score_lineup(lineup, copy_players, results)

    assert [s.slot for s in slots] == [Position.GOALKEEPER] + [Position.FIELD] * 4
    assert [s.points for s in slots] == [8, 8, 0, 0, 0]
    assert slots[1].goals == 1 and slots[1].rating == 6.3
    assert slots[2].copy_id is None and slots[2].player_id is None
    # Alineado pero sin nota (no jugó): 0 puntos, sin nota.
    assert slots[3].player_id == "p-b" and slots[3].rating is None and slots[3].goals == 0


def test_score_lineup_without_results_scores_zero_everywhere() -> None:
    lineup = Lineup(goalkeeper="c-gk", field=("c-a", None, None, None))

    slots = score_lineup(lineup, {"c-gk": "p-gk", "c-a": "p-a"}, {})

    assert sum(s.points for s in slots) == 0
    assert all(s.rating is None for s in slots)


def test_the_captain_scores_double() -> None:
    lineup = Lineup(goalkeeper="c-gk", field=("c-a", None, None, None), captain="c-a")
    copy_players = {"c-gk": "p-gk", "c-a": "p-a"}
    results = {"p-gk": PlayerResult(7.5, 0), "p-a": PlayerResult(6.3, 1)}

    slots = score_lineup(lineup, copy_players, results)

    assert [s.points for s in slots] == [8, 16, 0, 0, 0]
    assert [s.captain for s in slots] == [False, True, False, False, False]


def test_a_captain_without_rating_still_scores_zero() -> None:
    lineup = Lineup(goalkeeper="c-gk", field=(None,) * 4, captain="c-gk")

    [goalkeeper, *_] = score_lineup(lineup, {"c-gk": "p-gk"}, {})

    assert goalkeeper.captain and goalkeeper.points == 0
