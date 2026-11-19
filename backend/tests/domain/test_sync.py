from app.domain.stints.events import EventKind
from app.domain.sync import (
    Decision,
    IncomingEvent,
    LineupItem,
    SyncItem,
    Verdict,
    decide,
    decide_lineup_voids,
    decide_voids,
)


def item(id_: str, seq: int | None = None) -> SyncItem:
    return SyncItem(id_, seq)


def verdicts(decisions: tuple[Decision, ...]) -> dict[str, Verdict]:
    return {d.id: d.verdict for d in decisions}


def decide_simple(
    items: list[SyncItem],
    own: set[str] | None = None,
    foreign: set[str] | None = None,
    taken: dict[int, str] | None = None,
) -> tuple[Decision, ...]:
    return decide(items, own or set(), foreign or set(), taken or {})


def test_unseen_items_are_new() -> None:
    result = decide_simple([item("a", 1), item("b", 2)])

    assert verdicts(result) == {"a": Verdict.NEW, "b": Verdict.NEW}


def test_an_item_already_stored_for_this_match_is_a_duplicate() -> None:
    result = decide_simple([item("a", 1)], own={"a"})

    assert verdicts(result) == {"a": Verdict.DUPLICATE}


def test_resending_a_batch_makes_everything_duplicates() -> None:
    first = decide_simple([item("a", 1), item("b", 2)])
    stored = {d.id for d in first if d.verdict is Verdict.NEW}

    again = decide_simple([item("a", 1), item("b", 2)], own=stored)

    assert set(verdicts(again).values()) == {Verdict.DUPLICATE}


def test_an_id_that_belongs_to_another_match_is_rejected() -> None:
    result = decide_simple([item("a", 1)], foreign={"a"})

    assert result[0].verdict is Verdict.REJECTED
    assert result[0].reason == "id_conflict"


def test_a_seq_already_used_by_another_item_is_rejected() -> None:
    result = decide_simple([item("b", 1)], taken={1: "a"})

    assert result[0].verdict is Verdict.REJECTED
    assert result[0].reason == "seq_conflict"


def test_the_same_item_with_its_own_seq_is_a_duplicate_not_a_conflict() -> None:
    result = decide_simple([item("a", 1)], own={"a"}, taken={1: "a"})

    assert result[0].verdict is Verdict.DUPLICATE


def test_two_new_items_sharing_a_seq_in_the_same_batch_conflict() -> None:
    result = decide_simple([item("a", 1), item("b", 1)])

    assert verdicts(result) == {"a": Verdict.NEW, "b": Verdict.REJECTED}


def test_the_same_id_twice_in_a_batch_is_stored_once() -> None:
    result = decide_simple([item("a", 1), item("a", 1)])

    assert [d.verdict for d in result] == [Verdict.NEW, Verdict.DUPLICATE]


def test_items_without_seq_only_check_the_id() -> None:
    result = decide_simple([item("a"), item("b")], own={"a"})

    assert verdicts(result) == {"a": Verdict.DUPLICATE, "b": Verdict.NEW}


def test_decisions_follow_seq_order_regardless_of_arrival_order() -> None:
    result = decide_simple([item("c", 3), item("a", 1), item("b", 2)])

    assert [d.id for d in result] == ["a", "b", "c"]


def event(id_: str, kind: EventKind = EventKind.GOAL, voids: str | None = None) -> IncomingEvent:
    return IncomingEvent(id_, kind, voids)


def test_undo_of_a_known_event_is_valid() -> None:
    rejected = decide_voids(
        [event("u", EventKind.UNDO, "e1")], known={"e1": EventKind.GOAL}, voided=set()
    )

    assert rejected == {}


def test_undo_of_an_event_sent_earlier_in_the_same_batch_is_valid() -> None:
    batch = [event("e1"), event("u", EventKind.UNDO, "e1")]

    assert decide_voids(batch, known={}, voided=set()) == {}


def test_undo_of_an_unknown_event_is_rejected() -> None:
    rejected = decide_voids([event("u", EventKind.UNDO, "ghost")], known={}, voided=set())

    assert rejected == {"u": "void_target_missing"}


def test_undo_of_an_undo_is_rejected() -> None:
    rejected = decide_voids(
        [event("u2", EventKind.UNDO, "u1")], known={"u1": EventKind.UNDO}, voided=set()
    )

    assert rejected == {"u2": "void_of_undo"}


def test_undoing_the_same_event_twice_is_rejected() -> None:
    batch = [event("u1", EventKind.UNDO, "e1"), event("u2", EventKind.UNDO, "e1")]

    rejected = decide_voids(batch, known={"e1": EventKind.GOAL}, voided=set())

    assert rejected == {"u2": "already_voided"}


def test_undo_of_an_event_voided_in_a_previous_batch_is_rejected() -> None:
    rejected = decide_voids(
        [event("u2", EventKind.UNDO, "e1")], known={"e1": EventKind.GOAL}, voided={"e1"}
    )

    assert rejected == {"u2": "already_voided"}


def test_non_undo_events_are_never_checked() -> None:
    assert decide_voids([event("e1"), event("e2", EventKind.FOUL)], known={}, voided=set()) == {}


def lineup_item(id_: str, seq: int, voids: str | None = None, new: bool = True) -> LineupItem:
    return LineupItem(id_, seq, voids, new)


def test_a_lineup_undo_of_the_last_movement_is_valid() -> None:
    items = [lineup_item("l1", 1, new=False), lineup_item("l2", 2), lineup_item("u1", 3, "l2")]

    assert decide_lineup_voids(items) == {}


def test_a_lineup_undo_of_an_older_movement_is_rejected() -> None:
    items = [
        lineup_item("l1", 1, new=False),
        lineup_item("l2", 2, new=False),
        lineup_item("u1", 3, "l1"),
    ]

    assert decide_lineup_voids(items) == {"u1": "void_not_last"}


def test_lineup_undos_are_checked_in_seq_order_and_chain_backwards() -> None:
    items = [
        lineup_item("u2", 4, "l1"),
        lineup_item("u1", 3, "l2"),
        lineup_item("l2", 2, new=False),
        lineup_item("l1", 1, new=False),
    ]

    assert decide_lineup_voids(items) == {}


def test_bad_lineup_undos_are_rejected_with_their_reason() -> None:
    items = [
        lineup_item("l1", 1, new=False),
        lineup_item("u1", 2, "l1", new=False),
        lineup_item("u2", 3, "u1"),
        lineup_item("u3", 4, "l1"),
        lineup_item("u4", 5, "zz"),
    ]

    assert decide_lineup_voids(items) == {
        "u2": "void_of_undo",
        "u3": "void_not_last",
        "u4": "void_target_missing",
    }


def test_a_rejected_lineup_undo_does_not_change_what_comes_next() -> None:
    items = [
        lineup_item("l1", 1, new=False),
        lineup_item("l2", 2, new=False),
        lineup_item("u1", 3, "l1"),
        lineup_item("u2", 4, "l2"),
    ]

    assert decide_lineup_voids(items) == {"u1": "void_not_last"}
