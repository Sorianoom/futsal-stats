"""Alineación del Fantasy: 1 portero y 4 de campo de la propia plantilla, con huecos vacíos.

Cada guardado es una versión nueva. La alineación de una jornada es la última guardada antes de
su bloqueo; si no se toca, se arrastra la anterior.
"""

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime

from app.domain.fantasy.rules import LINEUP_FIELD_SLOTS
from app.domain.points.callup import Position


class LineupError(ValueError):
    """Alineación no válida para la plantilla del participante."""


@dataclass(frozen=True, slots=True)
class Lineup:
    """Ids de copia por hueco; None es un hueco vacío. `field` tiene siempre 4 huecos."""

    goalkeeper: str | None
    field: tuple[str | None, ...]

    def slots(self) -> list[tuple[Position, str | None]]:
        """Los 5 huecos en orden: el portero primero."""
        return [(Position.GOALKEEPER, self.goalkeeper)] + [(Position.FIELD, c) for c in self.field]

    def copy_ids(self) -> set[str]:
        return {copy_id for _, copy_id in self.slots() if copy_id is not None}


EMPTY_LINEUP = Lineup(goalkeeper=None, field=(None,) * LINEUP_FIELD_SLOTS)


@dataclass(frozen=True, slots=True)
class SavedLineup:
    saved_at: datetime
    lineup: Lineup


def _check_slot(copy_id: str, expected: Position, squad: Mapping[str, Position]) -> None:
    position = squad.get(copy_id)
    if position is None:
        raise LineupError("La copia no es de tu plantilla")
    if position is not expected:
        raise LineupError("El portero va en la portería y los de campo en el campo")


def build_lineup(
    goalkeeper: str | None, field: Sequence[str | None], squad: Mapping[str, Position]
) -> Lineup:
    """Valida la alineación con la posición de cada copia de la plantilla (copia → posición)."""
    if len(field) > LINEUP_FIELD_SLOTS:
        raise LineupError(f"Como mucho {LINEUP_FIELD_SLOTS} jugadores de campo")
    chosen = [c for c in (goalkeeper, *field) if c is not None]
    if len(chosen) != len(set(chosen)):
        raise LineupError("Una copia no puede ocupar dos huecos")
    if goalkeeper is not None:
        _check_slot(goalkeeper, Position.GOALKEEPER, squad)
    for copy_id in field:
        if copy_id is not None:
            _check_slot(copy_id, Position.FIELD, squad)
    padding = (None,) * (LINEUP_FIELD_SLOTS - len(field))
    return Lineup(goalkeeper=goalkeeper, field=(*field, *padding))


def lineup_in_force(history: Iterable[SavedLineup], lock: datetime) -> Lineup:
    """La última alineación guardada antes del bloqueo; sin ninguna, todos los huecos vacíos."""
    return latest_lineup(s for s in history if s.saved_at < lock)


def latest_lineup(history: Iterable[SavedLineup]) -> Lineup:
    last = max(history, key=lambda s: s.saved_at, default=None)
    return last.lineup if last is not None else EMPTY_LINEUP
