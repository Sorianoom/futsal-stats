"""Cierre de jornada: propiedad en el bloqueo, saldo en el bloqueo y puntos de la jornada."""

from datetime import UTC, date, datetime, timedelta

from app.domain.fantasy.calendar import RoundStatus, lock_time, settle_time
from app.domain.fantasy.lineup import Lineup
from app.domain.fantasy.scoring import PlayerResult
from app.domain.fantasy.settlement import (
    LedgerEntry,
    Transfer,
    balance_at,
    owners_at,
    round_score,
)

T0 = datetime(2026, 11, 10, 10, 0, tzinfo=UTC)
LOCK = datetime(2026, 11, 14, 23, 0, tzinfo=UTC)


def test_the_round_settles_at_midnight_after_the_match() -> None:
    assert settle_time(date(2026, 11, 14)) == lock_time(date(2026, 11, 15))
    assert RoundStatus.SETTLED == "settled"


def _transfer(copy_id: str, to: str | None, at: datetime) -> Transfer:
    return Transfer(copy_id=copy_id, to_participant_id=to, at=at)


def test_the_owner_at_a_moment_is_the_last_transfer_before_it() -> None:
    transfers = [
        _transfer("c1", "a", T0),
        _transfer("c1", "b", T0 + timedelta(days=1)),
        _transfer("c2", "a", T0),
        _transfer("c2", None, T0 + timedelta(days=1)),  # vendida a la banca
        _transfer("c3", "a", LOCK + timedelta(days=1)),  # después del bloqueo
    ]

    assert owners_at(transfers, LOCK) == {"c1": "b", "c2": None}


def test_a_transfer_at_the_lock_instant_counts_after_the_lock() -> None:
    transfers = [_transfer("c1", "a", T0), _transfer("c1", "b", LOCK)]

    assert owners_at(transfers, LOCK) == {"c1": "a"}


def test_the_balance_at_a_moment_undoes_the_later_movements() -> None:
    ledger = [
        LedgerEntry(amount=-5000, at=T0),
        LedgerEntry(amount=-3000, at=LOCK),  # en el instante del bloqueo: cuenta como después
        LedgerEntry(amount=1200, at=LOCK + timedelta(days=1)),
    ]

    assert balance_at(13200, ledger, LOCK) == 15000


LINEUP = Lineup(goalkeeper="c-gk", field=("c-a", "c-b", None, None))
PLAYERS = {"c-gk": "p-gk", "c-a": "p-a", "c-b": "p-b"}
RESULTS = {"p-gk": PlayerResult(7.5, 0), "p-a": PlayerResult(6.3, 1), "p-b": PlayerResult(6.0, 0)}


def test_round_score_adds_the_owned_slots() -> None:
    score = round_score(LINEUP, {"c-gk", "c-a", "c-b"}, PLAYERS, RESULTS, negative_balance=False)

    assert [s.points for s in score.slots] == [8, 8, 6, 0, 0]
    assert score.points == 22
    assert score.negative_balance is False


def test_a_copy_not_owned_at_the_lock_scores_zero() -> None:
    score = round_score(LINEUP, {"c-gk", "c-b"}, PLAYERS, RESULTS, negative_balance=False)

    assert [s.points for s in score.slots] == [8, 0, 6, 0, 0]
    assert score.slots[1].copy_id == "c-a"
    assert score.points == 14


def test_a_negative_balance_at_the_lock_scores_zero() -> None:
    score = round_score(LINEUP, {"c-gk", "c-a", "c-b"}, PLAYERS, RESULTS, negative_balance=True)

    assert score.points == 0
    assert all(s.points == 0 for s in score.slots)
    assert score.negative_balance is True
