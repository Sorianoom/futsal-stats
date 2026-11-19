"""Jornadas del Fantasy: una por partido oficial desde el inicio de la liga.

Los partidos solo tienen fecha, así que la alineación de una jornada se bloquea a las 00:00 (hora
de Madrid) del día del partido.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from enum import StrEnum

from app.domain.fantasy.rules import FANTASY_TIMEZONE


class RoundStatus(StrEnum):
    SETTLED = "settled"  # cerrada: puntos, cobros y valores congelados
    SCORED = "scored"  # provisional: bloqueada y con el partido cerrado
    PENDING = "pending"


@dataclass(frozen=True, slots=True)
class ScheduledMatch:
    match_id: str
    opponent: str
    held_on: date
    is_official: bool


@dataclass(frozen=True, slots=True)
class Round:
    match_id: str
    opponent: str
    held_on: date


def lock_time(held_on: date) -> datetime:
    """Momento del bloqueo: las 00:00 de Madrid del día del partido."""
    return datetime.combine(held_on, time.min, tzinfo=FANTASY_TIMEZONE)


def settle_time(held_on: date) -> datetime:
    """Cierre de la jornada: las 00:00 de Madrid del día siguiente al partido."""
    return lock_time(held_on + timedelta(days=1))


def day_start(day: date) -> datetime:
    """00:00 de Madrid de un día (apertura del mercado de la banca de ese día)."""
    return lock_time(day)


def madrid_date(moment: datetime) -> date:
    return moment.astimezone(FANTASY_TIMEZONE).date()


def is_locked(round_: Round, now: datetime) -> bool:
    return now >= lock_time(round_.held_on)


def league_rounds(matches: Iterable[ScheduledMatch], starts_on: date) -> list[Round]:
    """Partidos oficiales desde el día de inicio de la liga, por fecha."""
    rounds = [
        Round(m.match_id, m.opponent, m.held_on)
        for m in matches
        if m.is_official and m.held_on >= starts_on
    ]
    return sorted(rounds, key=lambda r: (r.held_on, r.match_id))


def next_open_round(rounds: Sequence[Round], now: datetime) -> Round | None:
    """Siguiente jornada aún no bloqueada (la que recibe la alineación que se guarde ahora)."""
    return next((r for r in rounds if not is_locked(r, now)), None)


def visible_rounds(rounds: Sequence[Round], now: datetime) -> list[Round]:
    """Jornadas de la clasificación: las ya bloqueadas y la próxima."""
    locked = [r for r in rounds if is_locked(r, now)]
    upcoming = next_open_round(rounds, now)
    return [*locked, upcoming] if upcoming is not None else locked


def round_status(round_: Round, now: datetime, *, closed: bool) -> RoundStatus:
    """Puntuada si la alineación ya está bloqueada y el partido cerrado; si no, pendiente."""
    return RoundStatus.SCORED if closed and is_locked(round_, now) else RoundStatus.PENDING
