"""Nota de un jugador en un partido a partir de sus estadísticas.

Se parte de una base de 5,4 (jugar sin hacer nada es un partido flojo) y se suman los pesos de
cada acción. Los cálculos se hacen en centésimas con enteros para evitar errores de coma
flotante; solo al final se convierte a float.

Hay dos valores: la puntuación exacta (`rating_score`, sin tope, la que usa el Fantasy) y la
nota que se enseña (`player_rating`, entre 1 y 10 con un decimal).
"""

from dataclasses import dataclass, fields

# Todos los pesos y límites están en centésimas de punto (150 = 1,5).
BASE_HUNDREDTHS = 540
MIN_HUNDREDTHS = 100
MAX_HUNDREDTHS = 1000
HUNDREDTHS_PER_POINT = 100
HUNDREDTHS_PER_TENTH = 10

MIN_SECONDS_FOR_RATING = 180  # 3 minutos en pista
# Cada bloque completo de estos segundos en pista sin gol en contra suma `clean_streaks`.
CLEAN_STREAK_SECONDS = 600  # 10 minutos

# Comunes a jugadores de campo y porteros.
COMMON_WEIGHTS: dict[str, int] = {
    "goals": 250,
    "assists": 70,
    "steals": 30,
    "key_actions": 20,
    "turnovers": -30,
    "fouls": -40,
    "yellows": -50,
    "reds": -200,
    "clean_streaks": 30,
}

# Solo jugadores de campo (las paradas no cuentan).
FIELD_WEIGHTS: dict[str, int] = {
    "shots": 10,
    "goals_for_on_court": 15,
    "goals_against_on_court": -15,
}

# Solo porteros (no se les aplican tiros ni goles a favor en pista). El gol del portero vale el
# doble: estos 250 se suman a los 250 comunes.
GOALKEEPER_WEIGHTS: dict[str, int] = {
    "goals": 250,
    "saves": 40,
    "goals_against_on_court": -40,
}


class RatingError(ValueError):
    """Datos de entrada imposibles para calcular una nota."""


@dataclass(frozen=True, slots=True)
class RatingInput:
    is_goalkeeper: bool
    seconds: int  # segundos en pista
    goals: int = 0
    assists: int = 0
    shots: int = 0  # tiros que NO acabaron en gol
    steals: int = 0
    key_actions: int = 0
    turnovers: int = 0
    fouls: int = 0
    yellows: int = 0
    reds: int = 0
    saves: int = 0
    goals_for_on_court: int = 0  # goles del equipo con él en pista
    goals_against_on_court: int = 0  # goles rivales con él en pista
    clean_streaks: int = 0  # bloques de CLEAN_STREAK_SECONDS en pista sin gol en contra


def _validate(data: RatingInput) -> None:
    for field in fields(data):
        if field.name == "is_goalkeeper":
            continue
        value = getattr(data, field.name)
        if value < 0:
            raise RatingError(f"{field.name} no puede ser negativo: {value}")


def _weighted_sum(data: RatingInput, weights: dict[str, int]) -> int:
    return sum(getattr(data, name) * weight for name, weight in weights.items())


def _hundredths(data: RatingInput) -> int | None:
    _validate(data)
    if data.seconds < MIN_SECONDS_FOR_RATING:
        return None
    role = GOALKEEPER_WEIGHTS if data.is_goalkeeper else FIELD_WEIGHTS
    return BASE_HUNDREDTHS + _weighted_sum(data, COMMON_WEIGHTS) + _weighted_sum(data, role)


def rating_score(data: RatingInput) -> float | None:
    """Puntuación exacta, en centésimas y sin tope (puede pasar de 10 o bajar de 1). La usa el
    Fantasy. None si jugó menos de 3 minutos."""
    hundredths = _hundredths(data)
    return None if hundredths is None else hundredths / HUNDREDTHS_PER_POINT


def player_rating(data: RatingInput) -> float | None:
    """Nota que se enseña: entre 1,0 y 10,0, redondeada a un decimal (,05 hacia arriba). None si
    jugó menos de 3 minutos."""
    hundredths = _hundredths(data)
    if hundredths is None:
        return None
    clamped = max(MIN_HUNDREDTHS, min(MAX_HUNDREDTHS, hundredths))
    tenths = (clamped + HUNDREDTHS_PER_TENTH // 2) // HUNDREDTHS_PER_TENTH
    return tenths / (HUNDREDTHS_PER_POINT // HUNDREDTHS_PER_TENTH)


@dataclass(frozen=True, slots=True)
class RatingPart:
    """Una línea del porqué de la nota: la acción, cuántas veces y lo que suma (centésimas)."""

    key: str  # "base" o el nombre del campo de RatingInput
    count: int
    hundredths: int


def rating_breakdown(data: RatingInput) -> list[RatingPart]:
    """Lo que suma o resta cada acción a la puntuación exacta (la base incluida), en el orden de
    las tablas de pesos. Solo las acciones que cuentan; vacío si no tiene nota."""
    if _hundredths(data) is None:
        return []
    role = GOALKEEPER_WEIGHTS if data.is_goalkeeper else FIELD_WEIGHTS
    parts = [RatingPart("base", 1, BASE_HUNDREDTHS)]
    for name in [*COMMON_WEIGHTS, *(k for k in role if k not in COMMON_WEIGHTS)]:
        count = getattr(data, name)
        weight = COMMON_WEIGHTS.get(name, 0) + role.get(name, 0)
        if count and weight:
            parts.append(RatingPart(name, count, count * weight))
    return parts
