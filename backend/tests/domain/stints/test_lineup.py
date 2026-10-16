import pytest

from app.domain.stints.lineup import (
    LineupError,
    LineupState,
    PartEnded,
    PartStarted,
    SentOff,
    Substituted,
    end_part,
    replay,
    send_off,
    start_part,
    substitute,
)
from app.domain.stints.models import Stint

STARTERS = ("p1", "p2", "p3", "p4", "p5")


def started(part: int = 1, starters: tuple[str, ...] = STARTERS) -> LineupState:
    return start_part(LineupState(), part, starters)


def test_start_part_opens_stints_at_minute_zero() -> None:
    state = started()

    assert state.on_court == frozenset(STARTERS)
    assert {s.start for s in state.open_stints} == {0}
    assert state.current_part == 1


def test_start_part_rejects_more_starters_than_capacity() -> None:
    with pytest.raises(LineupError):
        start_part(LineupState(), 1, (*STARTERS, "p6"))


def test_start_part_rejects_duplicate_starters() -> None:
    with pytest.raises(LineupError):
        start_part(LineupState(), 1, ("p1", "p1", "p2"))


def test_start_part_rejects_part_two_before_part_one_ended() -> None:
    with pytest.raises(LineupError):
        start_part(LineupState(), 2, STARTERS)


def test_start_part_rejects_a_part_already_in_progress() -> None:
    with pytest.raises(LineupError):
        start_part(started(), 1, STARTERS)


def test_start_part_rejects_unknown_part_number() -> None:
    with pytest.raises(LineupError):
        start_part(LineupState(), 3, STARTERS)


def test_substitute_closes_outgoing_and_opens_incoming_at_same_second() -> None:
    state = substitute(started(), 300, "p1", "p6")

    assert state.on_court == frozenset({"p2", "p3", "p4", "p5", "p6"})
    assert Stint("p1", 1, 0, 300) in state.closed_stints
    assert any(s.player_id == "p6" and s.start == 300 for s in state.open_stints)


def test_substitute_does_not_mutate_previous_state() -> None:
    before = started()

    substitute(before, 300, "p1", "p6")

    assert before.on_court == frozenset(STARTERS)
    assert before.closed_stints == ()


def test_substitute_rejects_player_out_not_on_court() -> None:
    with pytest.raises(LineupError):
        substitute(started(), 300, "p9", "p6")


def test_substitute_rejects_player_in_already_on_court() -> None:
    with pytest.raises(LineupError):
        substitute(started(), 300, "p1", "p2")


def test_substitute_rejects_time_going_backwards() -> None:
    state = substitute(started(), 300, "p1", "p6")

    with pytest.raises(LineupError):
        substitute(state, 200, "p2", "p7")


def test_substitute_requires_a_part_in_progress() -> None:
    with pytest.raises(LineupError):
        substitute(LineupState(), 10, "p1", "p6")


def test_substitute_at_start_drops_zero_length_stint() -> None:
    state = substitute(started(), 0, "p1", "p6")

    assert all(s.player_id != "p1" for s in state.closed_stints)
    assert "p1" not in state.on_court


def test_send_off_closes_stint_without_replacement() -> None:
    state = send_off(started(), 400, "p3")

    assert len(state.on_court) == 4
    assert Stint("p3", 1, 0, 400) in state.closed_stints
    assert state.sent_off == frozenset({"p3"})
    assert state.capacity == 4


def test_send_off_blocks_a_fifth_player_entering() -> None:
    state = send_off(started(), 400, "p3")

    with pytest.raises(LineupError):
        substitute(state, 500, "p1", "p3")


def test_sent_off_player_cannot_come_back_as_starter_next_part() -> None:
    state = end_part(send_off(started(), 400, "p3"), 1200)

    with pytest.raises(LineupError):
        start_part(state, 2, ("p1", "p2", "p3", "p4"))


def test_capacity_stays_four_in_next_part_after_red_card() -> None:
    state = end_part(send_off(started(), 400, "p3"), 1200)

    with pytest.raises(LineupError):
        start_part(state, 2, STARTERS)
    assert start_part(state, 2, ("p1", "p2", "p4", "p5")).capacity == 4


def test_send_off_rejects_player_not_on_court() -> None:
    with pytest.raises(LineupError):
        send_off(started(), 400, "p9")


def test_end_part_closes_every_open_stint() -> None:
    state = end_part(started(), 1200)

    assert state.open_stints == frozenset()
    assert state.current_part is None
    assert state.last_ended_part == 1
    assert {s.end for s in state.closed_stints} == {1200}
    assert len(state.closed_stints) == 5


def test_end_part_requires_a_part_in_progress() -> None:
    with pytest.raises(LineupError):
        end_part(LineupState(), 1200)


def test_end_part_rejects_time_before_clock() -> None:
    state = substitute(started(), 300, "p1", "p6")

    with pytest.raises(LineupError):
        end_part(state, 100)


def test_replay_builds_a_full_match() -> None:
    state = replay(
        [
            PartStarted(1, STARTERS),
            Substituted(600, "p1", "p6"),
            PartEnded(1200),
            PartStarted(2, ("p6", "p2", "p3", "p4", "p5")),
            SentOff(300, "p2"),
            PartEnded(1200),
        ]
    )

    assert state.last_ended_part == 2
    assert state.open_stints == frozenset()
    assert Stint("p1", 1, 0, 600) in state.closed_stints
    assert Stint("p6", 1, 600, 1200) in state.closed_stints
    assert Stint("p2", 2, 0, 300) in state.closed_stints
    assert state.sent_off == frozenset({"p2"})


def test_replay_of_no_events_is_the_empty_state() -> None:
    assert replay([]) == LineupState()
