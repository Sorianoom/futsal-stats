"""Dinero del Fantasy: cambio de valor de un jugador por jornada, cobros y venta a la banca.

Todo en enteros de miles (1000 = 1 M).
"""

from app.domain.fantasy.rules import (
    BANK_SALE_PERCENT,
    MIN_PLAYER_VALUE,
    PAYOUT_PER_POINT,
    PERCENT,
    VALUE_BASELINE_POINTS,
    VALUE_CHANGE_PER_POINT,
    VALUE_CHANGE_WITHOUT_RATING,
)


def value_change(points: int | None) -> int:
    """0,2 M × (puntos − 6) del jugador en la jornada; sin nota (no jugó), −0,2 M."""
    if points is None:
        return VALUE_CHANGE_WITHOUT_RATING
    return VALUE_CHANGE_PER_POINT * (points - VALUE_BASELINE_POINTS)


def next_value(before: int, points: int | None) -> int:
    """Valor tras la jornada, nunca por debajo del mínimo. `points` es None si no tuvo nota."""
    return max(MIN_PLAYER_VALUE, before + value_change(points))


def round_payout(points: int) -> int:
    """Cobro de un participante por los puntos de su alineación en la jornada."""
    return PAYOUT_PER_POINT * points


def bank_sale_price(value: int) -> int:
    """Lo que paga la banca por una copia: el 70 % de su valor, redondeado hacia abajo."""
    return value * BANK_SALE_PERCENT // PERCENT
