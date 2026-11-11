"""Puntos de un jugador alineado y de la alineación de un participante en una jornada."""

from collections.abc import Mapping
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from app.domain.fantasy.lineup import Lineup
from app.domain.fantasy.rules import MIN_PLAYER_POINTS, POINTS_PER_GOAL
from app.domain.points.callup import Position
from app.domain.rating.match import PlayerMatchResult

PlayerResult = PlayerMatchResult


def round_half_up(value: float) -> int:
    """Redondeo con ,5 hacia arriba (el `round` de Python redondea al par)."""
    return int(Decimal(str(value)).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def player_points(rating: float | None, goals: int) -> int:
    """Nota redondeada + 2 por gol. Sin nota (no jugó, menos de 3 min) = 0. Nunca negativo."""
    if rating is None:
        return MIN_PLAYER_POINTS
    return max(MIN_PLAYER_POINTS, round_half_up(rating) + POINTS_PER_GOAL * goals)


@dataclass(frozen=True, slots=True)
class SlotScore:
    slot: Position
    copy_id: str | None
    player_id: str | None
    rating: float | None
    goals: int
    points: int


def _slot_score(
    slot: Position,
    copy_id: str | None,
    copy_players: Mapping[str, str],
    results: Mapping[str, PlayerResult],
) -> SlotScore:
    player_id = copy_players.get(copy_id) if copy_id is not None else None
    result = results.get(player_id) if player_id is not None else None
    if result is None:
        return SlotScore(slot, copy_id, player_id, None, 0, MIN_PLAYER_POINTS)
    points = player_points(result.rating, result.goals)
    return SlotScore(slot, copy_id, player_id, result.rating, result.goals, points)


def score_lineup(
    lineup: Lineup, copy_players: Mapping[str, str], results: Mapping[str, PlayerResult]
) -> list[SlotScore]:
    """Puntos de los 5 huecos. `copy_players` da el jugador de cada copia; `results` la nota y
    los goles de cada jugador en el partido (vacío si la jornada aún no puntúa)."""
    return [_slot_score(slot, c, copy_players, results) for slot, c in lineup.slots()]
