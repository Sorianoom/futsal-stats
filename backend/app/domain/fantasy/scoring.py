"""Puntos de un jugador alineado y de la alineación de un participante en una jornada."""

from collections.abc import Mapping
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from app.domain.fantasy.lineup import Lineup
from app.domain.fantasy.rules import (
    CAPTAIN_MULTIPLIER,
    MIN_PLAYER_POINTS,
    MVP_BONUS,
)
from app.domain.points.callup import Position
from app.domain.rating.match import PlayerMatchResult
from app.domain.rating.score import RatingPart, rating_breakdown

PlayerResult = PlayerMatchResult


def round_half_up(value: float) -> int:
    """Redondeo con ,5 hacia arriba (el `round` de Python redondea al par)."""
    return int(Decimal(str(value)).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def player_points(score: float | None, mvp: bool = False) -> int:
    """Puntuación exacta (sin tope) redondeada + 2 si fue el MVP. Los goles ya van en la nota.
    Sin nota (no jugó, menos de 3 min) = 0. Nunca negativo."""
    if score is None:
        return MIN_PLAYER_POINTS
    bonus = MVP_BONUS if mvp else 0
    return max(MIN_PLAYER_POINTS, round_half_up(score) + bonus)


@dataclass(frozen=True, slots=True)
class BonusPart:
    """Puntos del Fantasy que no salen de la nota: hoy solo el MVP."""

    key: str  # "mvp"
    count: int
    points: int


def bonus_parts(result: PlayerResult) -> list[BonusPart]:
    """Extras de un jugador con nota: el MVP. Sin nota, ninguno."""
    if result.fantasy_score is None or not result.mvp:
        return []
    return [BonusPart("mvp", 1, MVP_BONUS)]


def result_points(result: PlayerResult) -> int:
    """Puntos de un jugador en la jornada a partir de su resultado en el partido."""
    return player_points(result.fantasy_score, result.mvp)


@dataclass(frozen=True, slots=True)
class SlotScore:
    slot: Position
    copy_id: str | None
    player_id: str | None
    rating: float | None
    goals: int
    points: int
    # Capitán: `points` ya va multiplicado.
    captain: bool = False
    # El porqué, congelado con la jornada: puntuación exacta, MVP, acciones y extras.
    score: float | None = None
    mvp: bool = False
    breakdown: tuple[RatingPart, ...] = ()
    bonus: tuple[BonusPart, ...] = ()


def _slot_score(
    slot: Position,
    copy_id: str | None,
    copy_players: Mapping[str, str],
    results: Mapping[str, PlayerResult],
    captain: bool,
) -> SlotScore:
    player_id = copy_players.get(copy_id) if copy_id is not None else None
    result = results.get(player_id) if player_id is not None else None
    multiplier = CAPTAIN_MULTIPLIER if captain else 1
    if result is None:
        return SlotScore(slot, copy_id, player_id, None, 0, MIN_PLAYER_POINTS * multiplier, captain)
    return SlotScore(
        slot,
        copy_id,
        player_id,
        result.rating,
        result.goals,
        result_points(result) * multiplier,
        captain,
        score=result.fantasy_score,
        mvp=result.mvp,
        breakdown=tuple(rating_breakdown(result.data)) if result.data else (),
        bonus=tuple(bonus_parts(result)),
    )


def score_lineup(
    lineup: Lineup, copy_players: Mapping[str, str], results: Mapping[str, PlayerResult]
) -> list[SlotScore]:
    """Puntos de los 5 huecos. `copy_players` da el jugador de cada copia; `results` la nota y
    los goles de cada jugador en el partido (vacío si la jornada aún no puntúa). El capitán
    puntúa por `CAPTAIN_MULTIPLIER`."""
    return [
        _slot_score(slot, c, copy_players, results, c is not None and c == lineup.captain)
        for slot, c in lineup.slots()
    ]
