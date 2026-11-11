"""Clasificación del Fantasy: suma de los puntos de las jornadas puntuadas."""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass


def display_name(player_name: str | None, email: str) -> str:
    """Nombre del jugador vinculado a la cuenta; si no hay, la parte del email antes de `@`."""
    return player_name if player_name is not None else email.split("@", 1)[0]


@dataclass(frozen=True, slots=True)
class StandingRow:
    participant_id: str
    display_name: str
    points_by_round: Mapping[str, int]

    @property
    def total(self) -> int:
        return sum(self.points_by_round.values())


def rank(rows: Iterable[StandingRow]) -> list[StandingRow]:
    """Por total descendente; a igualdad, por nombre."""
    return sorted(rows, key=lambda r: (-r.total, r.display_name.casefold()))
