"""Nombre visible del participante y orden de la clasificación."""

from app.domain.fantasy.standings import StandingRow, display_name, rank


def test_display_name_is_the_linked_player_name() -> None:
    assert display_name(None, "Pablo Pérez", "pablo@club.es") == "Pablo Pérez"


def test_display_name_without_player_is_the_email_local_part() -> None:
    assert display_name(None, None, "mister.juan@club.es") == "mister.juan"


def test_the_name_the_user_set_goes_first() -> None:
    assert display_name("Bruno", None, "mister.juan@club.es") == "Bruno"
    assert display_name("Bruno", "Pablo Pérez", "pablo@club.es") == "Bruno"


def test_rows_are_ranked_by_total_and_then_by_name() -> None:
    rows = [
        StandingRow("1", "beto", {"m1": 5}),
        StandingRow("2", "Ana", {"m1": 5}),
        StandingRow("3", "carla", {"m1": 3, "m2": 9}),
    ]

    ranked = rank(rows)

    assert [r.participant_id for r in ranked] == ["3", "2", "1"]
    assert ranked[0].total == 12
