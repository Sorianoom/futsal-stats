"""Cláusulas del Fantasy: precio inicial, coste de subirla y cuándo se puede pagar."""

from datetime import UTC, date, datetime, timedelta

import pytest

from app.domain.fantasy.clauses import (
    ClauseError,
    ClauseRejection,
    check_clause_buy,
    check_clause_raise,
    clause_after_purchase,
    initial_clause,
    raise_cost,
)
from app.domain.fantasy.market import Bidder
from app.domain.fantasy.rules import CLAUSE_PROTECTION_DAYS, MAX_MONEY_AMOUNT, SQUAD_LIMIT

# 10:00 en Madrid del 20 de noviembre.
NOW = datetime(2026, 11, 20, 9, 0, tzinfo=UTC)
LONG_AGO = NOW - timedelta(days=30)


def _buyer(**overrides: object) -> Bidder:
    base: dict[str, object] = {
        "participant_id": "buyer",
        "squad_size": 3,
        "player_ids": frozenset({"p1"}),
        "balance": 20_000,
    }
    return Bidder(**{**base, **overrides})  # type: ignore[arg-type]


def _buy(buyer: Bidder | None = None, **overrides: object) -> None:
    args: dict[str, object] = {
        "owner_id": "owner",
        "player_id": "p9",
        "clause": 6000,
        "acquired_at": LONG_AGO,
        "now": NOW,
        "match_days": frozenset(),
    }
    check_clause_buy(buyer or _buyer(), **{**args, **overrides})  # type: ignore[arg-type]


def _rejection(buyer: Bidder | None = None, **overrides: object) -> ClauseRejection:
    with pytest.raises(ClauseError) as caught:
        _buy(buyer, **overrides)
    return caught.value.reason


# --- Precio y subida -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"), [(4000, 6000), (4200, 6300), (500, 750), (333, 499)]
)
def test_initial_clause_is_one_and_a_half_times_the_value_rounded_down(
    value: int, expected: int
) -> None:
    assert initial_clause(value) == expected


@pytest.mark.parametrize(
    ("value", "price", "expected"),
    [
        (4000, 8000, 10000),  # pagó 8 M por un jugador de 4 M: 1,25 × 8 M, no 6 M
        (4000, 4000, 6000),  # pagó su valor: manda 1,5 × el valor
        (4000, 4900, 6125),  # 1,25 × 4,9 M ya supera a 1,5 × 4 M
        (4000, 0, 6000),
        (4000, 333, 6000),
        (500, 999, 1248),  # redondeo hacia abajo
    ],
)
def test_after_a_purchase_the_clause_is_above_the_price_paid(
    value: int, price: int, expected: int
) -> None:
    assert clause_after_purchase(value, price) == expected


def test_the_clause_after_a_purchase_is_capped() -> None:
    assert clause_after_purchase(1000, MAX_MONEY_AMOUNT) == MAX_MONEY_AMOUNT


@pytest.mark.parametrize(("current", "new", "expected"), [(6000, 8000, 1000), (6000, 6001, 1)])
def test_raising_costs_half_of_the_increase_rounded_up(
    current: int, new: int, expected: int
) -> None:
    assert raise_cost(current, new) == expected


def test_a_raise_must_be_higher_than_the_current_clause() -> None:
    with pytest.raises(ClauseError) as caught:
        check_clause_raise(current=6000, new=6000, balance=10_000)
    assert caught.value.reason is ClauseRejection.NOT_HIGHER


def test_a_raise_cannot_exceed_the_money_cap() -> None:
    with pytest.raises(ClauseError) as caught:
        check_clause_raise(current=6000, new=MAX_MONEY_AMOUNT + 1, balance=MAX_MONEY_AMOUNT)
    assert caught.value.reason is ClauseRejection.TOO_HIGH


def test_a_raise_needs_balance_for_its_cost() -> None:
    with pytest.raises(ClauseError) as caught:
        check_clause_raise(current=6000, new=10_000, balance=1999)
    assert caught.value.reason is ClauseRejection.INSUFFICIENT_BALANCE


def test_a_raise_with_enough_balance_is_valid() -> None:
    check_clause_raise(current=6000, new=10_000, balance=2000)


# --- Clausulazo ----------------------------------------------------------------------------------


def test_a_clause_buy_with_balance_and_room_is_valid() -> None:
    _buy()


def test_a_balance_equal_to_the_clause_is_enough() -> None:
    _buy(_buyer(balance=6000))


def test_my_own_copy_cannot_be_bought() -> None:
    assert _rejection(owner_id="buyer") is ClauseRejection.OWN_COPY


def test_a_full_squad_cannot_buy() -> None:
    assert _rejection(_buyer(squad_size=SQUAD_LIMIT)) is ClauseRejection.SQUAD_FULL


def test_a_player_already_in_the_squad_cannot_be_bought_twice() -> None:
    assert _rejection(_buyer(player_ids=frozenset({"p9"}))) is ClauseRejection.DUPLICATE_PLAYER


def test_the_buyer_needs_balance_for_the_whole_clause() -> None:
    assert _rejection(_buyer(balance=5999)) is ClauseRejection.INSUFFICIENT_BALANCE


def test_a_copy_is_protected_for_seven_days_after_it_arrives() -> None:
    just_inside = NOW - timedelta(days=CLAUSE_PROTECTION_DAYS) + timedelta(seconds=1)
    assert _rejection(acquired_at=just_inside) is ClauseRejection.PROTECTED


def test_protection_ends_exactly_seven_days_later() -> None:
    _buy(acquired_at=NOW - timedelta(days=CLAUSE_PROTECTION_DAYS))


def test_no_clause_buys_on_a_match_day_in_madrid() -> None:
    assert _rejection(match_days=frozenset({date(2026, 11, 20)})) is ClauseRejection.MATCH_DAY


def test_the_match_day_follows_madrid_time_not_utc() -> None:
    # 23:30 UTC del 19 = 00:30 del 20 en Madrid.
    late = datetime(2026, 11, 19, 23, 30, tzinfo=UTC)
    rejection = _rejection(now=late, match_days=frozenset({date(2026, 11, 20)}))
    assert rejection is ClauseRejection.MATCH_DAY


def test_the_day_after_the_match_is_allowed() -> None:
    _buy(match_days=frozenset({date(2026, 11, 19)}))
