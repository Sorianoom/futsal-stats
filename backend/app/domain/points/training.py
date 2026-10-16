"""Puntos ganados en entrenos. Un empate no genera movimientos."""

from collections.abc import Iterable
from datetime import date
from enum import StrEnum

from app.domain.points.ledger import Movement
from app.domain.points.weeks import week_start


class WinKind(StrEnum):
    EXERCISE = "exercise"
    SCRIMMAGE = "scrimmage"
    GOALKEEPER = "goalkeeper"


TRAINING_POINTS = {WinKind.EXERCISE: 2, WinKind.SCRIMMAGE: 5, WinKind.GOALKEEPER: 2}
TRAINING_REASONS = {
    WinKind.EXERCISE: "Ejercicio ganado",
    WinKind.SCRIMMAGE: "Partidillo final ganado",
    WinKind.GOALKEEPER: "Portero: porterías a cero a criterio del entrenador",
}


def award_wins(
    player_ids: Iterable[str], kind: WinKind, occurred_on: date, session_id: str
) -> tuple[Movement, ...]:
    return tuple(
        Movement(
            player_id=player_id,
            occurred_on=occurred_on,
            points=TRAINING_POINTS[kind],
            reason=TRAINING_REASONS[kind],
            applies_week=week_start(occurred_on),
            session_id=session_id,
        )
        for player_id in dict.fromkeys(player_ids)
    )
