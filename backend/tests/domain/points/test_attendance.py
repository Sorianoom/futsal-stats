import pytest

from app.domain.points.attendance import (
    AttendanceRecord,
    AttendanceStatus,
    SessionKind,
    propose_for_attendance,
)
from app.domain.points.catalog import SanctionKind
from app.domain.points.default_catalog import catalog_by_code

CATALOG = catalog_by_code()


def record(
    kind: SessionKind,
    status: AttendanceStatus,
    notified: bool = False,
    minutes_late: int = 0,
) -> AttendanceRecord:
    return AttendanceRecord("p1", kind, status, notified, minutes_late)


def code_for(rec: AttendanceRecord) -> str | None:
    proposal = propose_for_attendance(rec, CATALOG)
    return proposal.infraction_code if proposal else None


@pytest.mark.parametrize("status", [AttendanceStatus.ATTENDED, AttendanceStatus.JUSTIFIED])
@pytest.mark.parametrize("kind", list(SessionKind))
def test_attending_or_justified_never_proposes_anything(
    kind: SessionKind, status: AttendanceStatus
) -> None:
    assert code_for(record(kind, status)) is None


def test_training_absence_with_notice_but_unjustified_is_serious_a() -> None:
    rec = record(SessionKind.TRAINING, AttendanceStatus.UNJUSTIFIED, notified=True)

    assert code_for(rec) == "G-a"


def test_training_absence_without_notice_is_very_serious_a() -> None:
    rec = record(SessionKind.TRAINING, AttendanceStatus.UNJUSTIFIED, notified=False)

    assert code_for(rec) == "MG-a"


@pytest.mark.parametrize(
    ("minutes", "expected"),
    [(0, None), (5, None), (15, None), (16, "G-c"), (20, "G-c"), (21, "MG-b"), (45, "MG-b")],
)
def test_training_lateness_without_notice(minutes: int, expected: str | None) -> None:
    rec = record(SessionKind.TRAINING, AttendanceStatus.LATE, minutes_late=minutes)

    assert code_for(rec) == expected


def test_training_lateness_with_notice_is_not_penalised() -> None:
    rec = record(SessionKind.TRAINING, AttendanceStatus.LATE, notified=True, minutes_late=30)

    assert code_for(rec) is None


@pytest.mark.parametrize(
    ("minutes", "expected"),
    [(5, None), (10, None), (11, "G-b"), (20, "G-b"), (21, "MG-c")],
)
def test_match_lateness_without_notice(minutes: int, expected: str | None) -> None:
    rec = record(SessionKind.MATCH, AttendanceStatus.LATE, minutes_late=minutes)

    assert code_for(rec) == expected


def test_match_very_late_arrival_proposes_not_playing_that_match() -> None:
    rec = record(SessionKind.MATCH, AttendanceStatus.LATE, minutes_late=25)

    proposal = propose_for_attendance(rec, CATALOG)

    assert proposal is not None
    assert proposal.sanction is not None
    assert proposal.sanction.kind is SanctionKind.NO_PLAY


def test_match_absence_without_notice_proposes_one_or_two_matches_out() -> None:
    rec = record(SessionKind.MATCH, AttendanceStatus.UNJUSTIFIED)

    proposal = propose_for_attendance(rec, CATALOG)

    assert proposal is not None
    assert proposal.infraction_code == "MG-a"
    assert proposal.sanction is not None
    assert (
        proposal.sanction.kind,
        proposal.sanction.min_matches,
        proposal.sanction.max_matches,
    ) == (
        SanctionKind.NO_CALLUP,
        1,
        2,
    )


def test_training_absence_has_no_sanction() -> None:
    rec = record(SessionKind.TRAINING, AttendanceStatus.UNJUSTIFIED)

    proposal = propose_for_attendance(rec, CATALOG)

    assert proposal is not None
    assert proposal.sanction is None


def test_match_absence_with_notice_is_not_typified() -> None:
    rec = record(SessionKind.MATCH, AttendanceStatus.UNJUSTIFIED, notified=True)

    assert code_for(rec) is None


def test_missing_physio_without_notice_is_very_serious_d() -> None:
    rec = record(SessionKind.PHYSIO, AttendanceStatus.UNJUSTIFIED)

    assert code_for(rec) == "MG-d"


def test_missing_physio_with_notice_is_not_penalised() -> None:
    rec = record(SessionKind.PHYSIO, AttendanceStatus.UNJUSTIFIED, notified=True)

    assert code_for(rec) is None


def test_missing_any_other_session_without_notice_is_very_serious_a() -> None:
    rec = record(SessionKind.OTHER, AttendanceStatus.UNJUSTIFIED)

    assert code_for(rec) == "MG-a"
