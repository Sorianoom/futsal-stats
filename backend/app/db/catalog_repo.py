"""Acceso a datos del catálogo de faltas y de las reglas de asistencia (idempotente)."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AttendanceRuleRow, InfractionRow
from app.domain.points.attendance import DEFAULT_ATTENDANCE_RULES, AttendanceRule
from app.domain.points.catalog import Infraction, SanctionRule
from app.domain.points.default_catalog import DEFAULT_CATALOG


def _sanction_columns(sanction: SanctionRule | None) -> dict[str, Any]:
    return {
        "sanction_kind": sanction.kind if sanction else None,
        "sanction_min_matches": sanction.min_matches if sanction else None,
        "sanction_max_matches": sanction.max_matches if sanction else None,
    }


def _to_sanction(
    kind: Any, min_matches: int | None, max_matches: int | None
) -> SanctionRule | None:
    if kind is None or min_matches is None or max_matches is None:
        return None
    return SanctionRule(kind, min_matches, max_matches)


def _infraction_values(infraction: Infraction) -> dict[str, Any]:
    return {
        "code": infraction.code,
        "severity": infraction.severity,
        "points": infraction.points,
        "description": infraction.description,
        "deferral": infraction.deferral,
        "in_pdf_letter": infraction.in_pdf_letter,
        **_sanction_columns(infraction.sanction),
    }


def _rule_values(position: int, rule: AttendanceRule) -> dict[str, Any]:
    return {
        "position": position,
        "session_kind": rule.session_kind,
        "status": rule.status,
        "notified": rule.notified,
        "infraction_code": rule.infraction_code,
        "late_more_than": rule.late_more_than,
        **_sanction_columns(rule.sanction),
    }


async def _upsert(
    session: AsyncSession, model: type, values: list[dict[str, Any]], key: str
) -> None:
    statement = pg_insert(model).values(values)
    updates = {name: statement.excluded[name] for name in values[0] if name != key}
    await session.execute(statement.on_conflict_do_update(index_elements=[key], set_=updates))


async def seed_catalog(session: AsyncSession) -> None:
    """Inserta o restaura el catálogo por defecto y las reglas de asistencia."""
    await _upsert(session, InfractionRow, [_infraction_values(i) for i in DEFAULT_CATALOG], "code")
    rules = [_rule_values(index, rule) for index, rule in enumerate(DEFAULT_ATTENDANCE_RULES, 1)]
    await _upsert(session, AttendanceRuleRow, rules, "position")


async def load_catalog(session: AsyncSession) -> dict[str, Infraction]:
    rows = (await session.execute(select(InfractionRow))).scalars().all()
    return {
        row.code: Infraction(
            code=row.code,
            severity=row.severity,
            points=row.points,
            description=row.description,
            deferral=row.deferral,
            sanction=_to_sanction(
                row.sanction_kind, row.sanction_min_matches, row.sanction_max_matches
            ),
            in_pdf_letter=row.in_pdf_letter,
        )
        for row in rows
    }


async def load_attendance_rules(session: AsyncSession) -> tuple[AttendanceRule, ...]:
    query = select(AttendanceRuleRow).order_by(AttendanceRuleRow.position)
    rows = (await session.execute(query)).scalars().all()
    return tuple(
        AttendanceRule(
            session_kind=row.session_kind,
            status=row.status,
            notified=row.notified,
            infraction_code=row.infraction_code,
            late_more_than=row.late_more_than,
            sanction=_to_sanction(
                row.sanction_kind, row.sanction_min_matches, row.sanction_max_matches
            ),
        )
        for row in rows
    )
