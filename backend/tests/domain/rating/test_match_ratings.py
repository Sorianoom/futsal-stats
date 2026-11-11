"""Notas y goles de todos los jugadores de un partido a partir de sus tramos y eventos."""

from app.domain.rating import RatingInput, player_rating
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
        )
    )
    expected_gk = player_rating(
        RatingInput(
            is_goalkeeper=True,
            seconds=PART_SECONDS,
            saves=1,
            goals_for_on_court=1,
            goals_against_on_court=1,
        )
    )
    assert results["a"].rating == expected_a and results["a"].goals == 1
    assert results["gk"].rating == expected_gk and results["gk"].goals == 0
    assert results["sub"].rating is None  # menos de 3 minutos


def test_without_stints_nobody_has_a_rating() -> None:
    events = [MatchEvent(id="e1", kind=EventKind.GOAL, part=1, t=100, player_id="a")]

    results = match_results([], events, goalkeeper_ids=set())

    assert results["a"].rating is None and results["a"].goals == 1
