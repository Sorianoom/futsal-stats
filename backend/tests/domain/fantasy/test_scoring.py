"""Puntos de un jugador alineado y de una alineación en una jornada."""

import pytest

from app.domain.fantasy.lineup import Lineup
from app.domain.fantasy.scoring import (
    BonusPart,
    PlayerResult,
    bonus_parts,
    player_points,
    result_points,
    score_lineup,
)
from app.domain.points.callup import Position


@pytest.mark.parametrize(
    ("score", "expected"),
    [
        (6.3, 6),
        (10.95, 11),  # Samuel contra el Athletic Txapeldunak: sus goles ya van en la nota
        (6.5, 7),  # ,5 redondea hacia arriba
        (5.45, 5),  # se redondea la puntuación exacta, no la nota de un decimal
        (1.0, 1),
        (15.2, 15),  # sin tope de 10
    ],
)
def test_player_points_are_the_exact_score_rounded_half_up(score: float, expected: int) -> None:
    assert player_points(score) == expected


def test_goals_add_nothing_outside_the_rating() -> None:
    # Joan contra el Athletic Txapeldunak: 15,2 sin tope con su gol de portero dentro.
    result = PlayerResult(rating=10.0, goals=1, goalkeeper=True, score=15.2)

    assert result_points(result) == 15
    assert bonus_parts(result) == []


def test_result_points_use_the_exact_score_over_the_shown_rating() -> None:
    assert result_points(PlayerResult(rating=10.0, goals=0, score=12.6)) == 13
    assert result_points(PlayerResult(rating=None, goals=1)) == 0


def test_a_player_without_rating_scores_zero() -> None:
    assert player_points(None) == 0


def test_points_are_never_negative() -> None:
    assert player_points(-3.0) == 0


def test_score_lineup_fills_the_five_slots_and_empty_slots_score_zero() -> None:
    lineup = Lineup(goalkeeper="c-gk", field=("c-a", None, "c-b", None))
    copy_players = {"c-gk": "p-gk", "c-a": "p-a", "c-b": "p-b"}
    results = {"p-gk": PlayerResult(7.5, 0), "p-a": PlayerResult(6.3, 1)}

    slots = score_lineup(lineup, copy_players, results)

    assert [s.slot for s in slots] == [Position.GOALKEEPER] + [Position.FIELD] * 4
    assert [s.points for s in slots] == [8, 6, 0, 0, 0]
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

    assert [s.points for s in slots] == [8, 12, 0, 0, 0]
    assert [s.captain for s in slots] == [False, True, False, False, False]


def test_a_captain_without_rating_still_scores_zero() -> None:
    lineup = Lineup(goalkeeper="c-gk", field=(None,) * 4, captain="c-gk")

    [goalkeeper, *_] = score_lineup(lineup, {"c-gk": "p-gk"}, {})

    assert goalkeeper.captain and goalkeeper.points == 0


def test_the_mvp_adds_two_points_if_he_played() -> None:
    assert player_points(7.0, mvp=True) == player_points(7.0) + 2
    assert player_points(None, mvp=True) == 0
    assert bonus_parts(PlayerResult(rating=7.0, goals=0, mvp=True, score=7.0)) == [
        BonusPart("mvp", 1, 2)
    ]
