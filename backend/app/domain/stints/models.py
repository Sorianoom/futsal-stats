"""Tipos inmutables del dominio de tramos. Todos los tiempos son segundos dentro de la parte."""

from dataclasses import dataclass

VALID_PARTS = (1, 2)


@dataclass(frozen=True, slots=True)
class Stint:
    """Tramo cerrado: un jugador en pista entre `start` y `end` (segundos de la parte)."""

    player_id: str
    part: int
    start: int
    end: int

    @property
    def seconds(self) -> int:
        return self.end - self.start


@dataclass(frozen=True, slots=True)
class OpenStint:
    """Tramo abierto: el jugador está en pista desde `start` y aún no ha salido."""

    player_id: str
    part: int
    start: int
