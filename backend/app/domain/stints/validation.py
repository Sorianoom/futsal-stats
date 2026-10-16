"""Validación de tramos editados a mano: formato correcto y sin solapes por jugador."""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from itertools import combinations

from app.domain.stints.models import VALID_PARTS, Stint


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
    if problems:
        raise StintValidationError(problems)
