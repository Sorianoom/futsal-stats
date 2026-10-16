from collections.abc import Mapping
from datetime import date

from app.domain.points.callup import (
    CallupCandidate,
    CallupConfig,
    PlayerStatus,
    Position,
    generate_callup,
    select_top,
)
from app.domain.points.catalog import SanctionKind
from app.domain.points.ledger import Movement

WEEK = date(2026, 10, 12)


def field(
    player_id: str, dorsal: int, status: PlayerStatus = PlayerStatus.AVAILABLE
) -> CallupCandidate:
    return CallupCandidate(player_id, Position.FIELD, status, dorsal)


def keeper(player_id: str, dorsal: int) -> CallupCandidate:
    return CallupCandidate(player_id, Position.GOALKEEPER, PlayerStatus.AVAILABLE, dorsal)


def with_points(deltas: Mapping[str, int], week: date = WEEK) -> list[Movement]:
    return [Movement(pid, WEEK, delta, "ajuste", week) for pid, delta in deltas.items() if delta]


def squad(count: int) -> list[CallupCandidate]:
    return [field(f"f{i:02d}", i) for i in range(1, count + 1)]


def distinct_points(count: int) -> list[Movement]:
    return with_points({f"f{i:02d}": count - i + 1 for i in range(1, count + 1)})


def test_select_top_takes_the_best_when_there_are_no_ties() -> None:
    selection = select_top([("a", 30), ("b", 25), ("c", 20)], slots=2)

    assert (selection.guaranteed, selection.tied, selection.open_slots) == (("a", "b"), (), 0)


def test_select_top_with_fewer_entries_than_slots_leaves_slots_open() -> None:
    selection = select_top([("a", 30)], slots=3)

    assert (selection.guaranteed, selection.tied, selection.open_slots) == (("a",), (), 2)


def test_select_top_ties_inside_the_selection_are_not_ambiguous() -> None:
    selection = select_top([("a", 30), ("b", 30), ("c", 20)], slots=3)

    assert selection.tied == ()
    assert selection.guaranteed == ("a", "b", "c")


def test_select_top_tie_that_exactly_fills_the_slots_is_not_ambiguous() -> None:
    selection = select_top([("a", 30), ("b", 25), ("c", 25), ("d", 10)], slots=3)

    assert selection.tied == ()
    assert selection.guaranteed == ("a", "b", "c")


def test_select_top_tie_across_the_cut_is_flagged() -> None:
    selection = select_top([("a", 30), ("b", 25), ("c", 25), ("d", 25)], slots=2)

    assert selection.guaranteed == ("a",)
    assert selection.tied == ("b", "c", "d")
    assert selection.open_slots == 1
    assert selection.is_ambiguous


def test_calls_up_the_top_ten_field_players_and_four_starters() -> None:
    result = generate_callup(squad(12), distinct_points(12), WEEK)

    assert result.field.guaranteed == tuple(f"f{i:02d}" for i in range(1, 11))
    assert result.starters.guaranteed == ("f01", "f02", "f03", "f04")
    assert not result.field.is_ambiguous
    assert not result.starters.is_ambiguous


def test_tie_at_the_cut_is_marked_and_left_to_the_coach() -> None:
    deltas = {f"f{i:02d}": 10 - i for i in range(1, 9)}  # f01..f08 por encima de 20
    result = generate_callup(squad(11), with_points(deltas), WEEK)

    assert result.field.guaranteed == tuple(f"f{i:02d}" for i in range(1, 9))
    assert result.field.tied == ("f09", "f10", "f11")
    assert result.field.open_slots == 2


def test_injured_players_are_out_of_ranking_and_call_up() -> None:
    candidates = [*squad(11), field("hurt", 99, PlayerStatus.INJURED)]
    movements = with_points({"hurt": 50})

    result = generate_callup(candidates, movements, WEEK)

    assert "hurt" not in {r.player_id for r in result.ranking}
    assert "hurt" not in result.field.guaranteed + result.field.tied


def test_sanctioned_players_stay_in_ranking_but_never_get_called_up() -> None:
    movements = distinct_points(12)

    result = generate_callup(squad(12), movements, WEEK, exclusions={"f01": SanctionKind.NO_CALLUP})

    assert "f01" not in result.field.guaranteed
    assert result.field.guaranteed[0] == "f02"
    top = result.ranking[0]
    assert (top.player_id, top.excluded) == ("f01", SanctionKind.NO_CALLUP)


def test_two_goalkeepers_are_called_by_points() -> None:
    candidates = [keeper("g1", 1), keeper("g2", 12), keeper("g3", 13)]
    movements = with_points({"g2": 5, "g3": 2})

    result = generate_callup(candidates, movements, WEEK)

    assert result.goalkeepers.guaranteed == ("g2", "g3")
    assert result.field.guaranteed == ()


def test_keepers_never_compete_with_field_players() -> None:
    candidates = [*squad(10), keeper("g1", 1)]

    result = generate_callup(candidates, with_points({"g1": 30}), WEEK)

    assert "g1" not in result.field.guaranteed
    assert "g1" not in result.starters.guaranteed


def test_starters_tie_is_flagged_for_the_coach() -> None:
    deltas = {"f01": 9, "f02": 8, "f03": 7}  # f04..f10 empatan a 20
    result = generate_callup(squad(10), with_points(deltas), WEEK)

    assert result.starters.guaranteed == ("f01", "f02", "f03")
    assert result.starters.is_ambiguous
    assert result.starters.open_slots == 1


def test_only_movements_of_the_requested_week_count() -> None:
    other_week = date(2026, 10, 5)
    movements = with_points({"f02": 10}, week=other_week) + with_points({"f01": 1})

    result = generate_callup(squad(2), movements, WEEK)

    assert [r.player_id for r in result.ranking] == ["f01", "f02"]
    assert [r.points for r in result.ranking] == [21, 20]


def test_ties_are_listed_in_dorsal_order() -> None:
    candidates = [field("late", 9), field("early", 2)]

    result = generate_callup(candidates, [], WEEK)

    assert [r.player_id for r in result.ranking] == ["early", "late"]


def test_breakdown_is_returned_for_every_ranked_player() -> None:
    result = generate_callup(squad(3), with_points({"f01": 5}), WEEK)

    breakdown = result.breakdowns["f01"]
    assert breakdown.total == 25
    assert [m.points for m in breakdown.items] == [5]
    assert set(result.breakdowns) == {"f01", "f02", "f03"}


def test_config_changes_the_number_of_slots() -> None:
    config = CallupConfig(field_slots=3, goalkeeper_slots=1, starters=2)
    candidates = [*squad(5), keeper("g1", 1), keeper("g2", 2)]

    result = generate_callup(
        candidates, distinct_points(5) + with_points({"g2": 1}), WEEK, config=config
    )

    assert result.field.guaranteed == ("f01", "f02", "f03")
    assert result.goalkeepers.guaranteed == ("g2",)
    assert result.starters.guaranteed == ("f01", "f02")
