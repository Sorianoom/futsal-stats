"""Validación de la alineación y alineación vigente en cada jornada."""

from datetime import UTC, datetime

import pytest

from app.domain.fantasy.lineup import (
    EMPTY_LINEUP,
    Lineup,
    LineupError,
    SavedLineup,
    build_lineup,
    latest_lineup,
    lineup_in_force,
)
from app.domain.points.callup import Position

SQUAD = {
    "gk": Position.GOALKEEPER,
    "a": Position.FIELD,
    "b": Position.FIELD,
    "c": Position.FIELD,
    "d": Position.FIELD,
    "e": Position.FIELD,
}


def test_build_lineup_pads_the_field_slots_with_empty_ones() -> None:
    lineup = build_lineup("gk", ["a", None, "b"], SQUAD)

    assert lineup == Lineup(goalkeeper="gk", field=("a", None, "b", None))


def test_an_empty_lineup_is_valid() -> None:
    assert build_lineup(None, [], SQUAD) == EMPTY_LINEUP


def test_slots_list_the_goalkeeper_first() -> None:
    lineup = Lineup(goalkeeper="gk", field=("a", None, None, None))

    assert lineup.slots() == [
        (Position.GOALKEEPER, "gk"),
        (Position.FIELD, "a"),
        (Position.FIELD, None),
        (Position.FIELD, None),
        (Position.FIELD, None),
    ]


@pytest.mark.parametrize(
    ("goalkeeper", "field"),
    [
        ("ajena", []),  # copia que no es suya
        (None, ["ajena"]),
        ("a", []),  # jugador de campo de portero
        (None, ["gk"]),  # portero en un hueco de campo
        (None, ["a", "a"]),  # copia repetida
        (None, ["a", "b", "c", "d", "e"]),  # más de 4 de campo
        (None, [None, None, None, None, None]),
    ],
)
def test_invalid_lineups_are_rejected(goalkeeper: str | None, field: list[str | None]) -> None:
    with pytest.raises(LineupError):
        build_lineup(goalkeeper, field, SQUAD)


def _saved(hour: int, goalkeeper: str) -> SavedLineup:
    return SavedLineup(
        saved_at=datetime(2026, 11, 14, hour, tzinfo=UTC),
        lineup=Lineup(goalkeeper=goalkeeper, field=(None, None, None, None)),
    )


def test_lineup_in_force_is_the_last_saved_before_the_lock() -> None:
    history = [_saved(20, "second"), _saved(10, "first"), _saved(23, "after")]

    in_force = lineup_in_force(history, datetime(2026, 11, 14, 23, tzinfo=UTC))

    assert in_force.goalkeeper == "second"


def test_without_lineup_before_the_lock_the_round_has_an_empty_lineup() -> None:
    history = [_saved(23, "after")]

    assert lineup_in_force(history, datetime(2026, 11, 14, 23, tzinfo=UTC)) == EMPTY_LINEUP


def test_latest_lineup_is_the_last_saved() -> None:
    assert latest_lineup([_saved(23, "last"), _saved(10, "first")]).goalkeeper == "last"
    assert latest_lineup([]) == EMPTY_LINEUP


# --- Capitán -------------------------------------------------------------------------------------


def test_the_captain_is_optional() -> None:
    assert build_lineup("gk", ["a"], SQUAD).captain is None


def test_any_lined_up_copy_can_be_captain_also_the_goalkeeper() -> None:
    assert build_lineup("gk", ["a"], SQUAD, captain="gk").captain == "gk"
    assert build_lineup("gk", ["a"], SQUAD, captain="a").captain == "a"


def test_the_captain_must_be_in_the_lineup() -> None:
    with pytest.raises(LineupError):
        build_lineup("gk", ["a"], SQUAD, captain="b")


def test_without_captain_the_copy_ids_do_not_change() -> None:
    lineup = Lineup(goalkeeper="gk", field=("a", None, None, None), captain="a")

    assert lineup.copy_ids() == {"gk", "a"}
