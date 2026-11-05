"""Nota de 1 a 10 de un jugador en un partido a partir de sus estadísticas.

Se parte de una base de 6,0 y se suman los pesos de cada acción. Todos los cálculos se hacen
en décimas con enteros para evitar errores de coma flotante; solo al final se convierte a float.
"""

from dataclasses import dataclass, fields

# Todos los pesos y límites están en décimas de punto (15 = 1,5).
BASE_TENTHS = 60
MIN_TENTHS = 10
MAX_TENTHS = 100
TENTHS_PER_POINT = 10

MIN_SECONDS_FOR_RATING = 180  # 3 minutos en pista
CLEAN_SHEET_MIN_SECONDS = 600  # 10 minutos en pista

# Comunes a jugadores de campo y porteros.
COMMON_WEIGHTS: dict[str, int] = {
    "goals": 15,
    "assists": 7,
    "steals": 3,
    "turnovers": -3,
    "fouls": -2,
    "yellows": -5,
    "reds": -20,
}

# Solo jugadores de campo (las paradas no cuentan).
FIELD_WEIGHTS: dict[str, int] = {
    "shots": 1,
    "goals_for_on_court": 3,
    "goals_against_on_court": -3,
}

# Solo porteros (no se les aplican tiros ni goles a favor en pista).
GOALKEEPER_WEIGHTS: dict[str, int] = {
    "saves": 4,
    "goals_against_on_court": -6,
}
CLEAN_SHEET_BONUS = 10


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
    turnovers: int = 0
    fouls: int = 0
    yellows: int = 0
    reds: int = 0
    saves: int = 0
    goals_for_on_court: int = 0  # goles del equipo con él en pista
    goals_against_on_court: int = 0  # goles rivales con él en pista


def _validate(data: RatingInput) -> None:
    for field in fields(data):
        if field.name == "is_goalkeeper":
            continue
        value = getattr(data, field.name)
        if value < 0:
            raise RatingError(f"{field.name} no puede ser negativo: {value}")


def _weighted_sum(data: RatingInput, weights: dict[str, int]) -> int:
    return sum(getattr(data, name) * weight for name, weight in weights.items())


def _role_tenths(data: RatingInput) -> int:
    if not data.is_goalkeeper:
        return _weighted_sum(data, FIELD_WEIGHTS)
    clean_sheet = data.seconds >= CLEAN_SHEET_MIN_SECONDS and data.goals_against_on_court == 0
    bonus = CLEAN_SHEET_BONUS if clean_sheet else 0
    return _weighted_sum(data, GOALKEEPER_WEIGHTS) + bonus


def player_rating(data: RatingInput) -> float | None:
    """Nota del partido entre 1,0 y 10,0 con un decimal, o None si jugó menos de 3 minutos."""
    _validate(data)
    if data.seconds < MIN_SECONDS_FOR_RATING:
        return None
    tenths = BASE_TENTHS + _weighted_sum(data, COMMON_WEIGHTS) + _role_tenths(data)
    clamped = max(MIN_TENTHS, min(MAX_TENTHS, tenths))
    return clamped / TENTHS_PER_POINT
