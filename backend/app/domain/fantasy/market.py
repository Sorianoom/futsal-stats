"""Mercado del Fantasy: mercado diario de la banca, validación de pujas y resolución de ventas.

Pujas en sobre cerrado. Cada puja debe ser como mucho el saldo del momento, pero no reserva
dinero. Al cierre gana la más alta válida; en empate, la más antigua (la hora del último cambio:
cambiar una puja pierde la antigüedad).
"""

import random
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum

from app.domain.fantasy.rules import (
    MARKET_DAILY_SIZE,
    MARKET_FIRST_WEEK_DAYS,
    MARKET_FIRST_WEEK_SIZE,
    SQUAD_LIMIT,
)


def daily_market_size(day: date, starts_on: date) -> int:
    """15 copias al día los 7 primeros días de la liga y 8 después."""
    first_week = (day - starts_on).days < MARKET_FIRST_WEEK_DAYS
    return MARKET_FIRST_WEEK_SIZE if first_week else MARKET_DAILY_SIZE


def pick_daily_market(
    free_copy_ids: Sequence[str], day: date, starts_on: date, rng: random.Random
) -> list[str]:
    """Copias libres de la banca (que no estén ya en venta) elegidas al azar para el día."""
    pool = sorted(free_copy_ids)
    return rng.sample(pool, min(daily_market_size(day, starts_on), len(pool)))


def min_bid(value: int, min_price: int | None) -> int:
    """La puja mínima: el valor actual o el precio mínimo del vendedor, el mayor."""
    return max(value, min_price or 0)


class BidRejection(StrEnum):
    OWN_LISTING = "own_listing"
    SQUAD_FULL = "squad_full"
    DUPLICATE_PLAYER = "duplicate_player"
    BID_TOO_LOW = "bid_too_low"
    INSUFFICIENT_BALANCE = "insufficient_balance"


class BidError(ValueError):
    def __init__(self, reason: BidRejection) -> None:
        super().__init__(reason.value)
        self.reason = reason


@dataclass(frozen=True, slots=True)
class Bidder:
    """Lo que importa de un participante para pujar: su plantilla actual y su saldo."""

    participant_id: str
    squad_size: int
    player_ids: frozenset[str]
    balance: int


def _squad_rejection(bidder: Bidder, player_id: str) -> BidRejection | None:
    if bidder.squad_size >= SQUAD_LIMIT:
        return BidRejection.SQUAD_FULL
    if player_id in bidder.player_ids:
        return BidRejection.DUPLICATE_PLAYER
    return None


def check_bid(
    bidder: Bidder, *, amount: int, player_id: str, minimum: int, seller_id: str | None
) -> None:
    """Lanza `BidError` si la puja no es válida ahora mismo."""
    if seller_id == bidder.participant_id:
        raise BidError(BidRejection.OWN_LISTING)
    squad_problem = _squad_rejection(bidder, player_id)
    if squad_problem is not None:
        raise BidError(squad_problem)
    if amount < minimum:
        raise BidError(BidRejection.BID_TOO_LOW)
    if amount > bidder.balance:
        raise BidError(BidRejection.INSUFFICIENT_BALANCE)


@dataclass(frozen=True, slots=True)
class Bid:
    participant_id: str
    amount: int
    placed_at: datetime


def winning_bid(bids: Iterable[Bid], player_id: str, bidders: Mapping[str, Bidder]) -> Bid | None:
    """La puja más alta de quien aún puede fichar la copia (hueco y sin ese jugador); en empate,
    la más antigua. Sin ninguna válida, nadie gana."""
    ordered = sorted(bids, key=lambda b: (-b.amount, b.placed_at, b.participant_id))
    for bid in ordered:
        bidder = bidders.get(bid.participant_id)
        if bidder is not None and _squad_rejection(bidder, player_id) is None:
            return bid
    return None


class TransferKind(StrEnum):
    """Cambios de dueño de una copia: el reparto inicial, una venta del mercado o a la banca, o
    un clausulazo."""

    INITIAL = "initial"
    MARKET = "market"
    BANK_SALE = "bank_sale"
    CLAUSE = "clause"


class LedgerKind(StrEnum):
    """Movimientos del saldo de un participante."""

    MARKET_PURCHASE = "market_purchase"
    MARKET_SALE = "market_sale"
    BANK_SALE = "bank_sale"
    ROUND_PAYOUT = "round_payout"
    CLAUSE_PURCHASE = "clause_purchase"
    CLAUSE_SALE = "clause_sale"
    CLAUSE_RAISE = "clause_raise"
