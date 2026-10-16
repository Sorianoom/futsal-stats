from datetime import date

import pytest

from app.domain.points.default_catalog import catalog_by_code
from app.domain.points.ledger import (
    BASE_POINTS,
    Movement,
    movement_for_infraction,
    weekly_balance,
    weekly_breakdown,
)
from app.domain.points.training import WinKind, award_wins

MONDAY = date(2026, 10, 12)
NEXT_MONDAY = date(2026, 10, 19)
CATALOG = catalog_by_code()


def move(player: str, points: int, week: date = MONDAY, day: date = MONDAY) -> Movement:
    return Movement(player, day, points, "motivo", week)


def test_base_points_are_twenty() -> None:
    assert BASE_POINTS == 20


def test_balance_without_movements_is_the_base() -> None:
    assert weekly_balance("p1", MONDAY, []) == 20


def test_balance_adds_only_this_players_movements_of_the_week() -> None:
    movements = [
        move("p1", 2),
        move("p1", -3),
        move("p2", 5),
        move("p1", 5, week=NEXT_MONDAY),
    ]

    assert weekly_balance("p1", MONDAY, movements) == 19


def test_balance_can_go_below_zero() -> None:
    assert weekly_balance("p1", MONDAY, [move("p1", -25)]) == -5


def test_points_do_not_carry_over_between_weeks() -> None:
    movements = [move("p1", 5, week=MONDAY)]

    assert weekly_balance("p1", NEXT_MONDAY, movements) == 20


def test_movement_must_apply_to_a_monday() -> None:
    with pytest.raises(ValueError, match="lunes"):
        Movement("p1", MONDAY, 2, "motivo", date(2026, 10, 14))


def test_immediate_infraction_applies_to_the_current_week() -> None:
    movement = movement_for_infraction("p1", date(2026, 10, 14), CATALOG["G-a"])

    assert (movement.points, movement.applies_week, movement.infraction_code) == (-5, MONDAY, "G-a")


def test_next_week_infraction_is_booked_now_but_applies_later() -> None:
    movement = movement_for_infraction("p1", date(2026, 10, 18), CATALOG["MG-c"])

    assert movement.occurred_on == date(2026, 10, 18)
    assert movement.applies_week == NEXT_MONDAY
    assert weekly_balance("p1", MONDAY, [movement]) == 20
    assert weekly_balance("p1", NEXT_MONDAY, [movement]) == 10


def test_back_talk_defers_only_when_it_happens_in_a_match() -> None:
    day = date(2026, 10, 14)

    in_training = movement_for_infraction("p1", day, CATALOG["MG-i"], in_match=False)
    in_match = movement_for_infraction("p1", day, CATALOG["MG-i"], in_match=True)

    assert in_training.applies_week == MONDAY
    assert in_match.applies_week == NEXT_MONDAY


def test_in_match_flag_does_not_defer_other_infractions() -> None:
    movement = movement_for_infraction("p1", date(2026, 10, 14), CATALOG["MG-a"], in_match=True)

    assert movement.applies_week == MONDAY


def test_infraction_movement_keeps_session_and_reason() -> None:
    movement = movement_for_infraction(
        "p1", MONDAY, CATALOG["L-b"], session_id="s1", reason="Tono con un compañero"
    )

    assert (movement.session_id, movement.reason) == ("s1", "Tono con un compañero")


def test_infraction_reason_defaults_to_the_catalog_description() -> None:
    movement = movement_for_infraction("p1", MONDAY, CATALOG["L-b"])

    assert movement.reason == CATALOG["L-b"].description


def test_breakdown_lists_items_in_date_order_with_total() -> None:
    movements = [
        move("p1", -3, day=date(2026, 10, 15)),
        move("p1", 2, day=date(2026, 10, 13)),
        move("p2", 5),
    ]

    breakdown = weekly_breakdown("p1", MONDAY, movements)

    assert breakdown.base == 20
    assert [m.points for m in breakdown.items] == [2, -3]
    assert breakdown.total == 19


def test_award_wins_creates_one_movement_per_winner() -> None:
    movements = award_wins(["p1", "p2"], WinKind.EXERCISE, date(2026, 10, 13), "s1")

    assert [(m.player_id, m.points, m.session_id) for m in movements] == [
        ("p1", 2, "s1"),
        ("p2", 2, "s1"),
    ]
    assert all(m.applies_week == MONDAY for m in movements)


def test_scrimmage_win_is_worth_five() -> None:
    (movement,) = award_wins(["p1"], WinKind.SCRIMMAGE, date(2026, 10, 13), "s1")

    assert movement.points == 5


def test_goalkeeper_award_is_worth_two() -> None:
    (movement,) = award_wins(["gk"], WinKind.GOALKEEPER, date(2026, 10, 13), "s1")

    assert movement.points == 2


def test_award_wins_ignores_duplicated_players() -> None:
    movements = award_wins(["p1", "p1"], WinKind.EXERCISE, date(2026, 10, 13), "s1")

    assert len(movements) == 1


def test_award_wins_for_nobody_is_empty_which_models_a_draw() -> None:
    assert award_wins([], WinKind.SCRIMMAGE, date(2026, 10, 13), "s1") == ()
