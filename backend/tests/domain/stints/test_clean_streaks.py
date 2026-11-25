"""Rachas de minutos en pista sin gol en contra (bloques completos de 10 minutos)."""

from app.domain.stints.models import Stint
from app.domain.stints.stats import GoalEvent, build_segments, clean_streaks_by_player

BLOCK = 600


def _streaks(stints: list[Stint], goals: list[GoalEvent]) -> dict[str, int]:
    return clean_streaks_by_player(build_segments(stints), goals, BLOCK)


def test_a_whole_part_without_conceding_counts_two_blocks() -> None:
    assert _streaks([Stint("p1", 1, 0, 1200)], []) == {"p1": 2}


def test_an_unfinished_block_does_not_count() -> None:
    assert _streaks([Stint("p1", 1, 0, 599)], []) == {"p1": 0}


def test_a_goal_against_on_court_resets_the_counter() -> None:
    # 500 s + gol en contra + 700 s: solo el segundo tramo completa un bloque.
    goals = [GoalEvent(1, 500, for_team=False)]

    assert _streaks([Stint("p1", 1, 0, 1200)], goals) == {"p1": 1}


def test_goals_for_do_not_reset_the_counter() -> None:
    goals = [GoalEvent(1, 500, for_team=True)]

    assert _streaks([Stint("p1", 1, 0, 1200)], goals) == {"p1": 2}


def test_a_goal_against_while_on_the_bench_does_not_reset() -> None:
    # p1 juega 0-400, en el banquillo encajan (500) y vuelve 800-1000: 600 s seguidos en pista.
    stints = [Stint("p1", 1, 0, 400), Stint("p1", 1, 800, 1000), Stint("p2", 1, 0, 1200)]
    goals = [GoalEvent(1, 500, for_team=False)]

    streaks = _streaks(stints, goals)

    assert streaks["p1"] == 1
    assert streaks["p2"] == 1  # 500 s antes del gol, 700 s después


def test_the_counter_carries_over_half_time() -> None:
    stints = [Stint("p1", 1, 900, 1200), Stint("p1", 2, 0, 300)]

    assert _streaks(stints, []) == {"p1": 1}


def test_a_goal_on_a_substitution_second_belongs_to_the_incoming_players() -> None:
    # Gol en contra en el segundo 600, cuando p2 entra por p1: cuenta para p2, no para p1.
    stints = [Stint("p1", 1, 0, 600), Stint("p2", 1, 600, 1200)]
    goals = [GoalEvent(1, 600, for_team=False)]

    assert _streaks(stints, goals) == {"p1": 1, "p2": 1}
