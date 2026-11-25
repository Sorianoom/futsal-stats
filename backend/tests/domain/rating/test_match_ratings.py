"""Notas y goles de todos los jugadores de un partido a partir de sus tramos y eventos."""

from app.domain.rating import RatingInput, player_rating, rating_score
from app.domain.rating.match import match_results
from app.domain.stints.events import EventKind, MatchEvent
from app.domain.stints.models import Stint

PART_SECONDS = 1200


def _stints(players: list[str]) -> list[Stint]:
    return [Stint(player_id=p, part=1, start=0, end=PART_SECONDS) for p in players]


def test_match_results_rate_every_player_and_count_goals() -> None:
    stints = _stints(["gk", "a", "b", "c", "d"]) + [Stint(player_id="sub", part=2, start=0, end=60)]
    events = [
        MatchEvent(id="e1", kind=EventKind.GOAL, part=1, t=100, player_id="a"),
        MatchEvent(id="e2", kind=EventKind.RIVAL_GOAL, part=1, t=200, player_id=None),
        MatchEvent(id="e3", kind=EventKind.SAVE, part=1, t=300, player_id="gk"),
    ]

    results = match_results(stints, events, goalkeeper_ids={"gk"})

    expected_a = player_rating(
        RatingInput(
            is_goalkeeper=False,
            seconds=PART_SECONDS,
            goals=1,
            goals_for_on_court=1,
            goals_against_on_court=1,
            clean_streaks=1,  # 1000 s en pista tras el gol en contra del segundo 200
        )
    )
    expected_gk = player_rating(
        RatingInput(
            is_goalkeeper=True,
            seconds=PART_SECONDS,
            saves=1,
            goals_for_on_court=1,
            goals_against_on_court=1,
            clean_streaks=1,
        )
    )
    assert results["a"].rating == expected_a and results["a"].goals == 1
    assert results["gk"].rating == expected_gk and results["gk"].goals == 0
    assert results["gk"].goalkeeper and not results["a"].goalkeeper
    assert results["sub"].rating is None  # menos de 3 minutos


def test_without_stints_nobody_has_a_rating() -> None:
    events = [MatchEvent(id="e1", kind=EventKind.GOAL, part=1, t=100, player_id="a")]

    results = match_results([], events, goalkeeper_ids=set())

    assert results["a"].rating is None and results["a"].goals == 1


def test_match_results_keep_the_exact_uncapped_score() -> None:
    stints = _stints(["gk", "a", "b", "c", "d"])
    events = [
        MatchEvent(id=f"e{i}", kind=EventKind.GOAL, part=1, t=100 + i, player_id="a")
        for i in range(4)
    ]

    results = match_results(stints, events, goalkeeper_ids={"gk"})

    expected = RatingInput(
        is_goalkeeper=False, seconds=PART_SECONDS, goals=4, goals_for_on_court=4, clean_streaks=2
    )
    assert results["a"].rating == 10.0
    assert results["a"].score == rating_score(expected) == 16.6
