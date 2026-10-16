"""Caso dorado compartido con el cliente TypeScript (`shared/fixtures`)."""

import json
from pathlib import Path
from typing import Any

import pytest

from app.domain.stints.lineup import (
    LineupEvent,
    PartEnded,
    PartStarted,
    SentOff,
    Substituted,
    replay,
)
from app.domain.stints.stats import (
    GoalEvent,
    QuintetRating,
    build_segments,
    quintet_stats,
    seconds_by_player,
)
from app.domain.stints.validation import validate_stints

FIXTURE = Path(__file__).parents[4] / "shared" / "fixtures" / "stints_full_match.json"


def parse_lineup_event(raw: dict[str, Any]) -> LineupEvent:
    match raw["type"]:
        case "part_started":
            return PartStarted(raw["part"], tuple(raw["starters"]))
        case "substituted":
            return Substituted(raw["t"], raw["player_out"], raw["player_in"])
        case "sent_off":
            return SentOff(raw["t"], raw["player_id"])
        case "part_ended":
            return PartEnded(raw["t"])
    raise ValueError(f"Tipo de evento desconocido: {raw['type']}")


@pytest.fixture(scope="module")
def fixture() -> dict[str, Any]:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))  # type: ignore[no-any-return]


def test_replayed_match_has_valid_stints(fixture: dict[str, Any]) -> None:
    state = replay(parse_lineup_event(e) for e in fixture["lineup_events"])

    validate_stints(state.closed_stints)
    assert state.open_stints == frozenset()
    assert sorted(state.sent_off) == fixture["expected"]["sent_off"]


def test_minutes_match_the_hand_computed_values(fixture: dict[str, Any]) -> None:
    state = replay(parse_lineup_event(e) for e in fixture["lineup_events"])

    assert seconds_by_player(state.closed_stints) == fixture["expected"]["seconds_by_player"]


def test_quintet_stats_match_the_hand_computed_values(fixture: dict[str, Any]) -> None:
    state = replay(parse_lineup_event(e) for e in fixture["lineup_events"])
    goals = [GoalEvent(g["part"], g["t"], g["for_team"]) for g in fixture["goals"]]
    ratings = [QuintetRating(r["part"], r["t"], r["stars"]) for r in fixture["ratings"]]

    stats = quintet_stats(build_segments(state.closed_stints), goals, ratings)

    actual = {
        tuple(sorted(players)): (
            s.seconds,
            s.goals_for,
            s.goals_against,
            s.rating_count,
            s.rating_total,
        )
        for players, s in stats.items()
    }
    expected = {
        tuple(q["players"]): (
            q["seconds"],
            q["goals_for"],
            q["goals_against"],
            q["rating_count"],
            q["rating_total"],
        )
        for q in fixture["expected"]["quintets"]
    }
    assert actual == expected
