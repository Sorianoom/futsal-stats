"""Validación de tramos editados a mano: formato, sin solapes por jugador y máximo 5 a la vez."""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from itertools import combinations

from app.domain.stints.models import VALID_PARTS, Stint

MAX_ON_COURT = 5


class StintValidationError(ValueError):
    def __init__(self, problems: Sequence[str]) -> None:
        super().__init__("; ".join(problems))
        self.problems = tuple(problems)


@dataclass(frozen=True, slots=True)
class Overlap:
    player_id: str
    first: Stint
    second: Stint


def find_overlaps(stints: Iterable[Stint]) -> tuple[Overlap, ...]:
    ordered = sorted(stints, key=lambda s: (s.player_id, s.part, s.start, s.end))
    return tuple(
        Overlap(a.player_id, a, b)
        for a, b in combinations(ordered, 2)
        if a.player_id == b.player_id and a.part == b.part and a.start < b.end and b.start < a.end
    )


def find_overcrowded(stints: Iterable[Stint]) -> tuple[tuple[int, int, int], ...]:
    """(parte, segundo, jugadores) donde hay más de 5 en pista, en cada inicio de tramo."""
    items = tuple(stints)
    found: list[tuple[int, int, int]] = []
    for part in sorted({s.part for s in items}):
        in_part = [s for s in items if s.part == part]
        for t in sorted({s.start for s in in_part}):
            on_court = sum(1 for s in in_part if s.start <= t < s.end)
            if on_court > MAX_ON_COURT:
                found.append((part, t, on_court))
    return tuple(found)


def _format_problems(stint: Stint) -> list[str]:
    label = f"{stint.player_id} parte {stint.part} [{stint.start}-{stint.end}]"
    problems: list[str] = []
    if stint.part not in VALID_PARTS:
        problems.append(f"{label}: parte inválida")
    if stint.start < 0:
        problems.append(f"{label}: inicio negativo")
    if stint.end <= stint.start:
        problems.append(f"{label}: el fin debe ser posterior al inicio")
    return problems


def validate_stints(stints: Iterable[Stint]) -> None:
    items = tuple(stints)
    problems = [problem for stint in items for problem in _format_problems(stint)]
    problems.extend(
        f"{o.player_id} se solapa en la parte {o.first.part}: "
        f"[{o.first.start}-{o.first.end}] y [{o.second.start}-{o.second.end}]"
        for o in find_overlaps(items)
    )
    problems.extend(
        f"hay {count} jugadores en pista a la vez en la parte {part} desde el segundo {t} "
        f"(máximo {MAX_ON_COURT})"
        for part, t, count in find_overcrowded(items)
    )
    if problems:
        raise StintValidationError(problems)
