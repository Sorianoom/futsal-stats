"""Mercado del Fantasy: mercado diario de la banca, pujas y resolución de una venta."""

import random
from datetime import UTC, date, datetime, timedelta

import pytest

from app.domain.fantasy.market import (
    Bid,
    Bidder,
    BidError,
    BidRejection,
    check_bid,
    daily_market_size,
    min_bid,
    pick_daily_market,
    winning_bid,
)
from app.domain.fantasy.rules import (
    MARKET_DAILY_SIZE,
    MARKET_FIRST_WEEK_SIZE,
    SQUAD_LIMIT,
)

STARTS_ON = date(2026, 11, 1)
T0 = datetime(2026, 11, 2, 10, 0, tzinfo=UTC)


# --- Mercado diario de la banca ------------------------------------------------------------------


@pytest.mark.parametrize(
    ("day", "expected"),
    [
        (date(2026, 11, 1), MARKET_FIRST_WEEK_SIZE),
        (date(2026, 11, 7), MARKET_FIRST_WEEK_SIZE),  # séptimo día
        (date(2026, 11, 8), MARKET_DAILY_SIZE),
        (date(2026, 12, 20), MARKET_DAILY_SIZE),
    ],
)
def test_the_first_week_has_fifteen_copies_a_day_and_then_eight(day: date, expected: int) -> None:
    assert daily_market_size(day, STARTS_ON) == expected


def test_the_daily_market_picks_free_copies_at_random() -> None:
    free = [f"c{n}" for n in range(40)]

    picked = pick_daily_market(free, date(2026, 11, 10), STARTS_ON, random.Random(1))

    assert len(picked) == MARKET_DAILY_SIZE
    assert len(set(picked)) == MARKET_DAILY_SIZE
    assert set(picked) <= set(free)
    assert picked == pick_daily_market(free, date(2026, 11, 10), STARTS_ON, random.Random(1))


def test_the_daily_market_takes_every_copy_when_there_are_few() -> None:
    free = ["c2", "c1", "c3"]

    picked = pick_daily_market(free, STARTS_ON, STARTS_ON, random.Random(1))

    assert sorted(picked) == ["c1", "c2", "c3"]


def test_the_daily_market_is_empty_without_free_copies() -> None:
    assert pick_daily_market([], STARTS_ON, STARTS_ON, random.Random(1)) == []


# --- Puja mínima y validación de una puja --------------------------------------------------------


def test_min_bid_is_the_value_or_the_sellers_price_if_higher() -> None:
    assert min_bid(4000, None) == 4000
    assert min_bid(4000, 5000) == 5000
    assert min_bid(4000, 1000) == 4000


def _bidder(squad: int = 2, players: frozenset[str] = frozenset(), balance: int = 20000) -> Bidder:
    return Bidder(participant_id="me", squad_size=squad, player_ids=players, balance=balance)


def _check(bidder: Bidder, amount: int = 4000, seller: str | None = None) -> None:
    check_bid(bidder, amount=amount, player_id="p1", minimum=4000, seller_id=seller)


def test_a_valid_bid_passes() -> None:
    _check(_bidder(), amount=20000)


@pytest.mark.parametrize(
    ("bidder", "amount", "seller", "reason"),
    [
        (_bidder(), 4000, "me", BidRejection.OWN_LISTING),
        (_bidder(squad=SQUAD_LIMIT), 4000, None, BidRejection.SQUAD_FULL),
        (_bidder(players=frozenset({"p1"})), 4000, None, BidRejection.DUPLICATE_PLAYER),
        (_bidder(), 3999, None, BidRejection.BID_TOO_LOW),
        (_bidder(balance=3000), 4000, None, BidRejection.INSUFFICIENT_BALANCE),
        (_bidder(balance=-100), 4000, None, BidRejection.INSUFFICIENT_BALANCE),
    ],
)
def test_invalid_bids_are_rejected_with_a_reason(
    bidder: Bidder, amount: int, seller: str | None, reason: BidRejection
) -> None:
    with pytest.raises(BidError) as error:
        _check(bidder, amount, seller)

    assert error.value.reason is reason


# --- Resolución de una venta ---------------------------------------------------------------------


def _bid(who: str, amount: int, minutes: int = 0) -> Bid:
    return Bid(participant_id=who, amount=amount, placed_at=T0 + timedelta(minutes=minutes))


def _squads(**sizes: int) -> dict[str, Bidder]:
    return {who: _bidder_for(who, size) for who, size in sizes.items()}


def _bidder_for(who: str, size: int, players: frozenset[str] = frozenset()) -> Bidder:
    return Bidder(participant_id=who, squad_size=size, player_ids=players, balance=0)


def test_the_highest_bid_wins() -> None:
    bids = [_bid("a", 4000), _bid("b", 5000, 5), _bid("c", 4500)]

    winner = winning_bid(bids, "p1", _squads(a=2, b=2, c=2))

    assert winner == bids[1]


def test_on_a_tie_the_oldest_bid_wins() -> None:
    bids = [_bid("late", 5000, 10), _bid("early", 5000, 1)]

    assert winning_bid(bids, "p1", _squads(late=2, early=2)) == bids[1]


def test_bidders_with_a_full_squad_or_the_same_player_are_skipped() -> None:
    bidders = {
        "full": _bidder_for("full", SQUAD_LIMIT),
        "dup": _bidder_for("dup", 3, frozenset({"p1"})),
        "ok": _bidder_for("ok", 3, frozenset({"p2"})),
    }
    bids = [_bid("full", 9000), _bid("dup", 8000), _bid("ok", 4000)]

    assert winning_bid(bids, "p1", bidders) == bids[2]


def test_without_valid_bids_nobody_wins() -> None:
    assert winning_bid([], "p1", {}) is None
    assert winning_bid([_bid("full", 9000)], "p1", _squads(full=SQUAD_LIMIT)) is None


def test_a_bidder_that_left_the_league_is_skipped() -> None:
    assert winning_bid([_bid("ghost", 9000)], "p1", {}) is None
