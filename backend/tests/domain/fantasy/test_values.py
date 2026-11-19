"""Dinero del Fantasy: cambio de valor por jornada, cobros y venta a la banca."""

import pytest

from app.domain.fantasy.rules import MIN_PLAYER_VALUE
from app.domain.fantasy.values import bank_sale_price, next_value, round_payout, value_change


@pytest.mark.parametrize(
    ("rating", "goals", "expected"),
    [
        (6.0, 0, 0),  # 6 puntos: no cambia
        (8.0, 0, 400),  # 0,2 M × (8 − 6)
        (6.3, 1, 400),  # 6 + 2 por gol = 8 puntos
        (4.0, 0, -400),
        (1.0, 0, -1000),
    ],
)
def test_value_changes_two_hundred_per_point_over_six(
    rating: float, goals: int, expected: int
) -> None:
    assert value_change(rating, goals) == expected


def test_without_rating_the_value_drops_two_hundred() -> None:
    assert value_change(None, 0) == -200
    assert value_change(None, 3) == -200


def test_next_value_applies_the_change() -> None:
    assert next_value(4000, 8.0, 0) == 4400
    assert next_value(4000, None, 0) == 3800


def test_the_value_never_drops_below_half_a_million() -> None:
    assert next_value(600, 1.0, 0) == MIN_PLAYER_VALUE
    assert next_value(MIN_PLAYER_VALUE, None, 0) == MIN_PLAYER_VALUE


def test_the_round_payout_is_a_hundred_per_point() -> None:
    assert round_payout(0) == 0
    assert round_payout(23) == 2300


@pytest.mark.parametrize(
    ("value", "expected"),
    [(4000, 2800), (4200, 2940), (500, 350), (4321, 3024)],  # 3024,7 → 3024
)
def test_bank_sale_pays_seventy_percent_rounded_down(value: int, expected: int) -> None:
    assert bank_sale_price(value) == expected
