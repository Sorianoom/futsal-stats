"""Cláusulas de rescisión del Fantasy.

Cada copia con dueño tiene una cláusula. Cualquiera con saldo y hueco puede pagarla y llevarse la
copia al momento (clausulazo), salvo durante los días de protección desde que llegó a su dueño o
el día de un partido (hora de Madrid).
"""

from collections.abc import Set
from datetime import date, datetime, timedelta
from enum import StrEnum

from app.domain.fantasy.calendar import madrid_date
from app.domain.fantasy.market import Bidder
from app.domain.fantasy.rules import (
    CLAUSE_DENOMINATOR,
    CLAUSE_NUMERATOR,
    CLAUSE_PROTECTION_DAYS,
    CLAUSE_RAISE_COST_DIVISOR,
    MAX_MONEY_AMOUNT,
    SQUAD_LIMIT,
)


class ClauseRejection(StrEnum):
    OWN_COPY = "own_copy"
    PROTECTED = "clause_protected"
    MATCH_DAY = "match_day"
    SQUAD_FULL = "squad_full"
    DUPLICATE_PLAYER = "duplicate_player"
    INSUFFICIENT_BALANCE = "insufficient_balance"
    NOT_HIGHER = "clause_not_higher"
    TOO_HIGH = "clause_too_high"


class ClauseError(ValueError):
    def __init__(self, reason: ClauseRejection) -> None:
        super().__init__(reason.value)
        self.reason = reason


def initial_clause(value: int) -> int:
    """Cláusula al fichar: 1,5 × el valor de mercado, en miles enteros hacia abajo."""
    return value * CLAUSE_NUMERATOR // CLAUSE_DENOMINATOR


def raise_cost(current: int, new: int) -> int:
    """Lo que paga el dueño por subir la cláusula: la mitad de la subida, hacia arriba."""
    return -(-(new - current) // CLAUSE_RAISE_COST_DIVISOR)


def check_clause_raise(*, current: int, new: int, balance: int) -> None:
    """Lanza `ClauseError` si el dueño no puede subir la cláusula a `new`."""
    if new <= current:
        raise ClauseError(ClauseRejection.NOT_HIGHER)
    if new > MAX_MONEY_AMOUNT:
        raise ClauseError(ClauseRejection.TOO_HIGH)
    if raise_cost(current, new) > balance:
        raise ClauseError(ClauseRejection.INSUFFICIENT_BALANCE)


def protected_until(acquired_at: datetime | None) -> datetime:
    """Fin de la protección de una copia que llegó a su dueño en `acquired_at`."""
    assert acquired_at is not None, "una copia con dueño siempre tiene fecha de llegada"
    return acquired_at + timedelta(days=CLAUSE_PROTECTION_DAYS)


def is_protected(acquired_at: datetime, now: datetime) -> bool:
    return now < protected_until(acquired_at)


def check_clause_buy(
    buyer: Bidder,
    *,
    owner_id: str,
    player_id: str,
    clause: int,
    acquired_at: datetime,
    now: datetime,
    match_days: Set[date],
) -> None:
    """Lanza `ClauseError` si `buyer` no puede pagar ahora la cláusula de esa copia."""
    if owner_id == buyer.participant_id:
        raise ClauseError(ClauseRejection.OWN_COPY)
    if madrid_date(now) in match_days:
        raise ClauseError(ClauseRejection.MATCH_DAY)
    if is_protected(acquired_at, now):
        raise ClauseError(ClauseRejection.PROTECTED)
    if buyer.squad_size >= SQUAD_LIMIT:
        raise ClauseError(ClauseRejection.SQUAD_FULL)
    if player_id in buyer.player_ids:
        raise ClauseError(ClauseRejection.DUPLICATE_PLAYER)
    if clause > buyer.balance:
        raise ClauseError(ClauseRejection.INSUFFICIENT_BALANCE)
