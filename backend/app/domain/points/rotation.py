"""Turno semanal de petos, agua y material por orden de dorsal."""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta

from app.domain.points.weeks import DAYS_PER_WEEK, week_start


@dataclass(frozen=True, slots=True)
class DutyPlayer:
    player_id: str
    dorsal: int


def duty_for_week(players: Sequence[DutyPlayer], first_week: date, week: date) -> str:
    if not players:
        raise ValueError("No hay jugadores para asignar el turno")
    weeks_elapsed = (week_start(week) - week_start(first_week)).days // DAYS_PER_WEEK
    if weeks_elapsed < 0:
        raise ValueError("La semana es anterior al inicio de la rotación")
    ordered = sorted(players, key=lambda p: p.dorsal)
    return ordered[weeks_elapsed % len(ordered)].player_id


def duty_schedule(
    players: Sequence[DutyPlayer], first_week: date, from_week: date, weeks: int
) -> tuple[tuple[date, str], ...]:
    start = week_start(from_week)
    return tuple(
        (day, duty_for_week(players, first_week, day))
        for day in (start + timedelta(days=DAYS_PER_WEEK * i) for i in range(weeks))
    )
