"""Puntos de una jornada con las reglas del mercado: propiedad y saldo en el bloqueo.

Convención: lo que ocurre justo en el instante del bloqueo (p. ej. el cierre del mercado de la
banca a las 00:00) cuenta como posterior. El bloqueo va primero.
"""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, replace
from datetime import datetime

from app.domain.fantasy.lineup import Lineup
from app.domain.fantasy.rules import MIN_PLAYER_POINTS
from app.domain.fantasy.scoring import PlayerResult, SlotScore, score_lineup


@dataclass(frozen=True, slots=True)
class Transfer:
    """Cambio de dueño de una copia. `to_participant_id` None = vuelve a la banca."""

    copy_id: str
    to_participant_id: str | None
    at: datetime


@dataclass(frozen=True, slots=True)
class LedgerEntry:
    amount: int
    at: datetime


def owners_at(transfers: Iterable[Transfer], moment: datetime) -> dict[str, str | None]:
    """Dueño de cada copia justo antes de `moment` (las que no tienen traspasos no salen).

    Los traspasos deben venir en orden de registro: a igual hora, gana el último."""
    owners: dict[str, tuple[datetime, str | None]] = {}
    for transfer in transfers:
        if transfer.at >= moment:
            continue
        current = owners.get(transfer.copy_id)
        if current is None or transfer.at >= current[0]:
            owners[transfer.copy_id] = (transfer.at, transfer.to_participant_id)
    return {copy_id: owner for copy_id, (_, owner) in owners.items()}


def balance_at(balance: int, ledger: Iterable[LedgerEntry], moment: datetime) -> int:
    """Saldo justo antes de `moment`: el actual deshaciendo los movimientos desde entonces."""
    return balance - sum(e.amount for e in ledger if e.at >= moment)


@dataclass(frozen=True, slots=True)
class RoundScore:
    slots: list[SlotScore]
    negative_balance: bool

    @property
    def points(self) -> int:
        return sum(s.points for s in self.slots)


def round_score(
    lineup: Lineup,
    owned_at_lock: set[str],
    copy_players: Mapping[str, str],
    results: Mapping[str, PlayerResult],
    *,
    negative_balance: bool,
) -> RoundScore:
    """Puntos de la alineación bloqueada. Una copia que no era suya en el bloqueo puntúa 0, y
    con saldo negativo en el bloqueo la jornada entera puntúa 0."""
    slots = [
        s
        if s.copy_id in owned_at_lock and not negative_balance
        else replace(s, points=MIN_PLAYER_POINTS)
        for s in score_lineup(lineup, copy_players, results)
    ]
    return RoundScore(slots=slots, negative_balance=negative_balance)
