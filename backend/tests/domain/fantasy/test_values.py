"""Dinero del Fantasy: cambio de valor por jornada, cobros y venta a la banca."""

import pytest

from app.domain.fantasy.rules import MIN_PLAYER_VALUE
from app.domain.fantasy.values import bank_sale_price, next_value, round_payout, value_change


@pytest.mark.parametrize(
    ("points", "expected"),
    [
        (6, 0),  # 6 puntos: no cambia
        (8, 400),  # 0,2 M × (8 − 6)
        (4, -400),
        (1, -1000),
    ],
)
def test_value_changes_two_hundred_per_point_over_six(points: int, expected: int) -> None:
    assert value_change(points) == expected


def test_without_rating_the_value_drops_two_hundred() -> None:
    assert value_change(None) == -200


def test_next_value_applies_the_change() -> None:
    assert next_value(4000, 8) == 4400
    assert next_value(4000, None) == 3800


def test_the_value_never_drops_below_half_a_million() -> None:
    assert next_value(600, 1) == MIN_PLAYER_VALUE
    assert next_value(MIN_PLAYER_VALUE, None) == MIN_PLAYER_VALUE


def test_the_round_payout_is_a_hundred_per_point() -> None:
    assert round_payout(0) == 0
    assert round_payout(23) == 2300


@pytest.mark.parametrize(
    ("value", "expected"),
    [(4000, 2800), (4200, 2940), (500, 350), (4321, 3024)],  # 3024,7 → 3024
)
def test_bank_sale_pays_seventy_percent_rounded_down(value: int, expected: int) -> None:
    assert bank_sale_price(value) == expected
