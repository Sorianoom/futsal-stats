"""Detalle de un gol (a favor o en contra): de qué tipo fue y desde qué punto de la pista.

El punto va sobre media pista, siempre la de la portería que recibe el gol: `x` de 0 a 100 de
banda a banda (de izquierda a derecha mirando hacia esa portería) e `y` de 0 a 100 desde la línea
de fondo hasta la de medio campo. Todo es opcional: en el partido hay prisa.
"""

from dataclasses import dataclass
from enum import StrEnum

from app.domain.stints.events import EventKind


class GoalDetailError(ValueError):
    """Detalle de gol imposible."""


class GoalTag(StrEnum):
    SET_PIECE = "set_piece"  # balón parado: córner, falta, saque de banda
    REHEARSED = "rehearsed"  # jugada ensayada
    COUNTER = "counter"  # contraataque
    TURNOVER = "turnover"  # en contra: pérdida en campo propio; a favor: robo en campo rival
    FAR_POST = "far_post"  # segundo palo
    LONG_SHOT = "long_shot"  # tiro lejano
    ONE_ON_ONE = "one_on_one"  # 1 contra 1
    REBOUND = "rebound"  # rebote o segunda jugada
    POWER_PLAY = "power_play"  # portero-jugador (5 contra 4)
    PENALTY = "penalty"  # penalti o doble penalti
    OWN_GOAL = "own_goal"  # gol en propia


GOAL_KINDS = (EventKind.GOAL, EventKind.RIVAL_GOAL)
MAX_GOAL_TAGS = 3
COURT_MIN = 0
COURT_MAX = 100


@dataclass(frozen=True, slots=True)
class GoalDetail:
    tags: tuple[GoalTag, ...] = ()
    x: int | None = None
    y: int | None = None


def validate_goal_detail(kind: EventKind, detail: GoalDetail) -> None:
    """Solo los goles llevan detalle: tipos sin repetir (como mucho 3) y punto completo."""
    empty = not detail.tags and detail.x is None and detail.y is None
    if kind not in GOAL_KINDS:
        if not empty:
            raise GoalDetailError("Solo un gol lleva tipo y punto de la pista")
        return
    if len(detail.tags) > MAX_GOAL_TAGS:
        raise GoalDetailError(f"Como mucho {MAX_GOAL_TAGS} tipos de gol")
    if len(set(detail.tags)) != len(detail.tags):
        raise GoalDetailError("Un tipo de gol repetido")
    if (detail.x is None) != (detail.y is None):
        raise GoalDetailError("El punto de la pista lleva las dos coordenadas")
    for value in (detail.x, detail.y):
        if value is not None and not COURT_MIN <= value <= COURT_MAX:
            raise GoalDetailError(f"Coordenada fuera de la pista: {value}")
