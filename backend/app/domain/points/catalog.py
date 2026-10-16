"""Tipos del catálogo de faltas. Los datos viven en `default_catalog` y, en producción, en BD."""

from dataclasses import dataclass
from enum import StrEnum


class Severity(StrEnum):
    LIGHT = "light"
    SERIOUS = "serious"
    VERY_SERIOUS = "very_serious"


class Deferral(StrEnum):
    NONE = "none"
    NEXT_WEEK = "next_week"
    NEXT_WEEK_IF_IN_MATCH = "next_week_if_in_match"


class SanctionKind(StrEnum):
    NO_PLAY = "no_play"
    NO_CALLUP = "no_callup"


@dataclass(frozen=True, slots=True)
class SanctionRule:
    """Sanción no numérica que solo se propone; la confirma el entrenador."""

    kind: SanctionKind
    min_matches: int
    max_matches: int


@dataclass(frozen=True, slots=True)
class Infraction:
    code: str
    severity: Severity
    points: int
    description: str
    deferral: Deferral = Deferral.NONE
    sanction: SanctionRule | None = None
    in_pdf_letter: bool = True
