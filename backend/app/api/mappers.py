"""Conversión de tipos de dominio a los esquemas de salida de la API."""

from app.domain.points.catalog import SanctionRule
from app.schemas.points import SanctionOut


def sanction_out(sanction: SanctionRule | None) -> SanctionOut | None:
    if sanction is None:
        return None
    return SanctionOut(
        kind=sanction.kind, min_matches=sanction.min_matches, max_matches=sanction.max_matches
    )
