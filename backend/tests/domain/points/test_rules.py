from datetime import date

from app.domain.points.default_catalog import catalog_by_code
from app.domain.points.ledger import Movement, movement_for_infraction
from app.domain.points.rules import Escalation, propose_escalations

MONDAY = date(2026, 10, 12)
CATALOG = catalog_by_code()


def light(code: str, day: int, player: str = "p1", session: str | None = None) -> Movement:
    return movement_for_infraction(player, date(2026, 10, day), CATALOG[code], session_id=session)


def propose(movements: list[Movement], player: str = "p1") -> tuple[Escalation, ...]:
    return propose_escalations(player, MONDAY, movements, CATALOG)


def test_three_light_faults_do_not_escalate() -> None:
    movements = [light("L-b", 12), light("L-c", 13), light("L-d", 14)]

    assert propose(movements) == ()


def test_four_light_faults_in_a_week_propose_serious_h() -> None:
    movements = [light("L-b", 12), light("L-c", 13), light("L-d", 14), light("L-b", 15)]

    proposals = propose(movements)

    assert [(p.infraction_code, p.week) for p in proposals] == [("G-h", MONDAY)]


def test_light_faults_of_other_weeks_or_players_do_not_count() -> None:
    movements = [
        light("L-b", 12),
        light("L-c", 13),
        light("L-d", 14),
        light("L-b", 20),  # semana siguiente
        light("L-b", 15, player="p2"),
    ]

    assert propose(movements) == ()


def test_escalation_already_registered_is_not_proposed_again() -> None:
    movements = [
        light("L-b", 12),
        light("L-c", 13),
        light("L-d", 14),
        light("L-b", 15),
        movement_for_infraction("p1", date(2026, 10, 15), CATALOG["G-h"]),
    ]

    assert propose(movements) == ()


def test_a_fifth_light_fault_does_not_add_a_second_escalation() -> None:
    movements = [light("L-b", d) for d in (12, 13, 14, 15, 16)]

    assert len(propose(movements)) == 1


def test_eight_light_faults_propose_two_escalations() -> None:
    movements = [light("L-b", 12 + i % 5) for i in range(8)]

    assert [p.infraction_code for p in propose(movements)] == ["G-h", "G-h"]


def test_one_registered_escalation_leaves_the_second_one_pending() -> None:
    movements = [light("L-b", 12 + i % 5) for i in range(8)]
    movements.append(movement_for_infraction("p1", date(2026, 10, 16), CATALOG["G-h"]))

    assert len(propose(movements)) == 1


def test_inattention_twice_in_one_session_proposes_serious_g() -> None:
    movements = [light("L-a", 13, session="s1"), light("L-a", 13, session="s1")]

    proposals = propose(movements)

    assert [(p.infraction_code, p.session_id) for p in proposals] == [("G-g", "s1")]


def test_inattention_in_different_sessions_does_not_escalate() -> None:
    movements = [light("L-a", 13, session="s1"), light("L-a", 14, session="s2")]

    assert propose(movements) == ()


def test_inattention_escalation_already_registered_for_the_session_is_not_repeated() -> None:
    movements = [
        light("L-a", 13, session="s1"),
        light("L-a", 13, session="s1"),
        movement_for_infraction("p1", date(2026, 10, 13), CATALOG["G-g"], session_id="s1"),
    ]

    assert propose(movements) == ()


def test_movements_without_infraction_are_ignored() -> None:
    movements = [Movement("p1", MONDAY, 2, "ejercicio", MONDAY) for _ in range(6)]

    assert propose(movements) == ()
