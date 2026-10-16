"""Escalado de faltas: se proponen, nunca se aplican solas."""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date

from app.domain.points.catalog import Infraction, Severity
from app.domain.points.ledger import Movement

INATTENTION_LIGHT = "L-a"
INATTENTION_ESCALATION = "G-g"
LIGHT_ESCALATION = "G-h"
LIGHTS_PER_ESCALATION = 4
INATTENTIONS_PER_SESSION = 2


@dataclass(frozen=True, slots=True)
class Escalation:
    player_id: str
    week: date
    infraction_code: str
    session_id: str | None = None


def _pending_light_escalations(
    week_moves: list[Movement], catalog: Mapping[str, Infraction]
) -> int:
    lights = sum(
        1
        for m in week_moves
        if m.infraction_code and catalog[m.infraction_code].severity is Severity.LIGHT
    )
    registered = sum(1 for m in week_moves if m.infraction_code == LIGHT_ESCALATION)
    return max(0, lights // LIGHTS_PER_ESCALATION - registered)


def _sessions_pending_inattention(week_moves: list[Movement]) -> list[str]:
    lights_by_session: dict[str, int] = {}
    escalated = {m.session_id for m in week_moves if m.infraction_code == INATTENTION_ESCALATION}
    for move in week_moves:
        if move.infraction_code == INATTENTION_LIGHT and move.session_id:
            lights_by_session[move.session_id] = lights_by_session.get(move.session_id, 0) + 1
    return sorted(
        session
        for session, count in lights_by_session.items()
        if count >= INATTENTIONS_PER_SESSION and session not in escalated
    )


def propose_escalations(
    player_id: str,
    week: date,
    movements: Iterable[Movement],
    catalog: Mapping[str, Infraction],
) -> tuple[Escalation, ...]:
    week_moves = [m for m in movements if m.player_id == player_id and m.applies_week == week]
    by_light = [
        Escalation(player_id, week, LIGHT_ESCALATION)
        for _ in range(_pending_light_escalations(week_moves, catalog))
    ]
    by_inattention = [
        Escalation(player_id, week, INATTENTION_ESCALATION, session)
        for session in _sessions_pending_inattention(week_moves)
    ]
    return tuple(by_light + by_inattention)
