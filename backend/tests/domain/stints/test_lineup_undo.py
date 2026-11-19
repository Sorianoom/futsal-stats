"""Deshacer movimientos de alineación: evento compensatorio y solo el último vigente (pila)."""

import json
from pathlib import Path
from typing import Any

import pytest

from app.domain.stints.lineup import (
    LineupError,
    LineupRecord,
    LineupUndo,
    PartEnded,
    PartStarted,
    Substituted,
    effective_lineup,
    lineup_undo_target,
    parse_lineup_payload,
    replay,
    replay_records,
)
from app.domain.stints.stats import seconds_by_player

FIXTURE = Path(__file__).parents[4] / "shared" / "fixtures" / "lineup_undo.json"
STARTED = LineupRecord("l1", PartStarted(1, ("p1", "p2", "p3", "p4", "p5")))
SUB = LineupRecord("l2", Substituted(300, "p1", "p6"))
END = LineupRecord("l3", PartEnded(1200))


def records_of(raw: list[dict[str, Any]]) -> list[LineupRecord]:
    return [LineupRecord(r["id"], parse_lineup_payload(r["payload"])) for r in raw]


@pytest.fixture(scope="module")
def fixture() -> dict[str, Any]:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))  # type: ignore[no-any-return]


def test_without_undos_every_movement_counts() -> None:
    assert effective_lineup([STARTED, SUB, END]) == (STARTED, SUB, END)


def test_an_undo_removes_the_last_movement_and_itself() -> None:
    undo = LineupRecord("u1", LineupUndo("l3"))

    assert effective_lineup([STARTED, SUB, END, undo]) == (STARTED, SUB)


def test_chained_undos_go_back_one_by_one() -> None:
    records = [
        STARTED,
        SUB,
        END,
        LineupRecord("u1", LineupUndo("l3")),
        LineupRecord("u2", LineupUndo("l2")),
    ]

    assert effective_lineup(records) == (STARTED,)
    assert lineup_undo_target(records) == STARTED


def test_only_the_last_movement_can_be_undone() -> None:
    with pytest.raises(LineupError, match="último"):
        effective_lineup([STARTED, SUB, END, LineupRecord("u1", LineupUndo("l2"))])


def test_an_undo_of_an_unknown_movement_is_an_error() -> None:
    with pytest.raises(LineupError, match="desconocido"):
        effective_lineup([STARTED, LineupRecord("u1", LineupUndo("zz"))])


def test_undoing_part_ended_reopens_the_part() -> None:
    records = [STARTED, SUB, END, LineupRecord("u1", LineupUndo("l3"))]

    state = replay_records(records)

    assert state.current_part == 1
    assert state.clock == 300
    assert state.on_court == frozenset({"p2", "p3", "p4", "p5", "p6"})


def test_the_undo_target_is_none_without_movements() -> None:
    assert lineup_undo_target([]) is None


def test_parse_rejects_unknown_types() -> None:
    with pytest.raises(LineupError):
        parse_lineup_payload({"type": "teleported"})


def test_golden_effective_movements(fixture: dict[str, Any]) -> None:
    effective = effective_lineup(records_of(fixture["records"]))

    assert [r.id for r in effective] == fixture["expected"]["effective_ids"]


def test_golden_minutes_ignore_what_was_undone(fixture: dict[str, Any]) -> None:
    state = replay_records(records_of(fixture["records"]))

    assert state.open_stints == frozenset()
    assert sorted(state.sent_off) == fixture["expected"]["sent_off"]
    assert seconds_by_player(state.closed_stints) == fixture["expected"]["seconds_by_player"]


def test_golden_partial_state_reopens_the_part(fixture: dict[str, Any]) -> None:
    partial = fixture["partial"]
    raw = fixture["records"]
    until = next(i for i, r in enumerate(raw) if r["id"] == partial["until"])
    records = records_of(raw[: until + 1])

    state = replay_records(records)

    assert state.current_part == partial["current_part"]
    assert state.clock == partial["clock"]
    assert sorted(state.on_court) == partial["on_court"]
    target = lineup_undo_target(records)
    assert target is not None
    assert target.id == partial["undo_target"]


def test_golden_invalid_logs_are_errors(fixture: dict[str, Any]) -> None:
    for case in fixture["invalid"]:
        with pytest.raises(LineupError):
            effective_lineup(records_of(case["records"]))


def test_replay_still_takes_plain_movements() -> None:
    assert replay([STARTED.event]).current_part == 1
