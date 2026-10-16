"""Asistencia por sesión → falta propuesta. Las reglas son datos, no código."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum

from app.domain.points.catalog import Infraction, SanctionKind, SanctionRule


class SessionKind(StrEnum):
    TRAINING = "training"
    MATCH = "match"
    PHYSIO = "physio"
    OTHER = "other"


class AttendanceStatus(StrEnum):
    ATTENDED = "attended"
    JUSTIFIED = "justified"
    UNJUSTIFIED = "unjustified"
    LATE = "late"


@dataclass(frozen=True, slots=True)
class AttendanceRecord:
    player_id: str
    session_kind: SessionKind
    status: AttendanceStatus
    notified: bool
    minutes_late: int = 0


@dataclass(frozen=True, slots=True)
class AttendanceRule:
    session_kind: SessionKind
    status: AttendanceStatus
    notified: bool
    infraction_code: str
    late_more_than: int | None = None
    sanction: SanctionRule | None = None


@dataclass(frozen=True, slots=True)
class AttendanceProposal:
    player_id: str
    infraction_code: str
    sanction: SanctionRule | None


_MATCH_ABSENCE_SANCTION = SanctionRule(SanctionKind.NO_CALLUP, 1, 2)

# Orden importa: la primera regla que encaja gana, así que los umbrales altos van antes.
DEFAULT_ATTENDANCE_RULES: tuple[AttendanceRule, ...] = (
    AttendanceRule(SessionKind.TRAINING, AttendanceStatus.UNJUSTIFIED, True, "G-a"),
    AttendanceRule(SessionKind.TRAINING, AttendanceStatus.UNJUSTIFIED, False, "MG-a"),
    AttendanceRule(SessionKind.TRAINING, AttendanceStatus.LATE, False, "MG-b", late_more_than=20),
    AttendanceRule(SessionKind.TRAINING, AttendanceStatus.LATE, False, "G-c", late_more_than=15),
    AttendanceRule(
        SessionKind.MATCH,
        AttendanceStatus.UNJUSTIFIED,
        False,
        "MG-a",
        sanction=_MATCH_ABSENCE_SANCTION,
    ),
    AttendanceRule(SessionKind.MATCH, AttendanceStatus.LATE, False, "MG-c", late_more_than=20),
    AttendanceRule(SessionKind.MATCH, AttendanceStatus.LATE, False, "G-b", late_more_than=10),
    AttendanceRule(SessionKind.PHYSIO, AttendanceStatus.UNJUSTIFIED, False, "MG-d"),
    AttendanceRule(SessionKind.OTHER, AttendanceStatus.UNJUSTIFIED, False, "MG-a"),
)


def _matches(rule: AttendanceRule, record: AttendanceRecord) -> bool:
    return (
        rule.session_kind is record.session_kind
        and rule.status is record.status
        and rule.notified == record.notified
        and (rule.late_more_than is None or record.minutes_late > rule.late_more_than)
    )


def propose_for_attendance(
    record: AttendanceRecord,
    catalog: Mapping[str, Infraction],
    rules: Sequence[AttendanceRule] = DEFAULT_ATTENDANCE_RULES,
) -> AttendanceProposal | None:
    rule = next((r for r in rules if _matches(r, record)), None)
    if rule is None:
        return None
    sanction = rule.sanction or catalog[rule.infraction_code].sanction
    return AttendanceProposal(record.player_id, rule.infraction_code, sanction)
