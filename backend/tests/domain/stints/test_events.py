import pytest

from app.domain.stints.events import (
    EventError,
    EventKind,
    MatchEvent,
    counts_by_player,
    effective_events,
    team_fouls_by_part,
    undo_target,
)


def event(
    id_: str,
    kind: EventKind,
    part: int = 1,
    t: int = 0,
    player_id: str | None = "p1",
    voids: str | None = None,
) -> MatchEvent:
    return MatchEvent(id_, kind, part, t, player_id, voids)


def test_effective_events_drops_voided_events_and_the_void_markers() -> None:
    log = [
        event("e1", EventKind.GOAL),
        event("e2", EventKind.SHOT),
        event("e3", EventKind.UNDO, player_id=None, voids="e2"),
    ]

    assert [e.id for e in effective_events(log)] == ["e1"]


def test_undo_target_is_the_last_event_not_yet_voided() -> None:
    log = [
        event("e1", EventKind.GOAL),
        event("e2", EventKind.SHOT),
        event("e3", EventKind.UNDO, player_id=None, voids="e2"),
    ]

    target = undo_target(log)

    assert target is not None
    assert target.id == "e1"


def test_undo_target_of_empty_log_is_none() -> None:
    assert undo_target([]) is None


def test_undo_target_is_none_when_everything_was_voided() -> None:
    log = [event("e1", EventKind.GOAL), event("e2", EventKind.UNDO, player_id=None, voids="e1")]

    assert undo_target(log) is None


def test_voiding_an_unknown_event_is_an_error() -> None:
    with pytest.raises(EventError):
        effective_events([event("e1", EventKind.UNDO, player_id=None, voids="nope")])


def test_voiding_twice_is_an_error() -> None:
    log = [
        event("e1", EventKind.GOAL),
        event("e2", EventKind.UNDO, player_id=None, voids="e1"),
        event("e3", EventKind.UNDO, player_id=None, voids="e1"),
    ]

    with pytest.raises(EventError):
        effective_events(log)


def test_undoing_an_undo_is_an_error() -> None:
    log = [
        event("e1", EventKind.GOAL),
        event("e2", EventKind.UNDO, player_id=None, voids="e1"),
        event("e3", EventKind.UNDO, player_id=None, voids="e2"),
    ]

    with pytest.raises(EventError):
        effective_events(log)


def test_an_undo_without_target_id_is_an_error() -> None:
    with pytest.raises(EventError):
        effective_events([event("e1", EventKind.UNDO, player_id=None)])


def test_duplicate_event_ids_are_an_error() -> None:
    with pytest.raises(EventError):
        effective_events([event("e1", EventKind.GOAL), event("e1", EventKind.SHOT)])


def test_team_fouls_are_counted_per_part() -> None:
    log = [
        event("e1", EventKind.FOUL, part=1),
        event("e2", EventKind.FOUL, part=1),
        event("e3", EventKind.FOUL, part=2),
        event("e4", EventKind.GOAL, part=2),
    ]

    assert team_fouls_by_part(log) == {1: 2, 2: 1}


def test_undone_fouls_are_not_counted() -> None:
    log = [
        event("e1", EventKind.FOUL),
        event("e2", EventKind.FOUL),
        event("e3", EventKind.UNDO, player_id=None, voids="e2"),
    ]

    assert team_fouls_by_part(log) == {1: 1}


def test_counts_by_player_groups_by_kind_and_ignores_events_without_player() -> None:
    log = [
        event("e1", EventKind.GOAL, player_id="p1"),
        event("e2", EventKind.GOAL, player_id="p1"),
        event("e3", EventKind.STEAL, player_id="p2"),
        event("e4", EventKind.RIVAL_GOAL, player_id=None),
    ]

    assert counts_by_player(log) == {
        "p1": {EventKind.GOAL: 2},
        "p2": {EventKind.STEAL: 1},
    }
