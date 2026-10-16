from collections import Counter

from app.domain.points.catalog import Deferral, SanctionKind, Severity
from app.domain.points.default_catalog import DEFAULT_CATALOG, catalog_by_code


def test_codes_are_unique() -> None:
    codes = [i.code for i in DEFAULT_CATALOG]

    assert len(codes) == len(set(codes))


def test_pdf_letters_match_the_regulation() -> None:
    lettered = Counter(i.severity for i in DEFAULT_CATALOG if i.in_pdf_letter)

    assert lettered == {Severity.LIGHT: 4, Severity.SERIOUS: 8, Severity.VERY_SERIOUS: 15}


def test_points_follow_the_severity() -> None:
    expected = {Severity.LIGHT: -3, Severity.SERIOUS: -5, Severity.VERY_SERIOUS: -10}

    assert all(i.points == expected[i.severity] for i in DEFAULT_CATALOG)


def test_only_c_g_and_i_have_deferred_effect() -> None:
    deferred = {i.code: i.deferral for i in DEFAULT_CATALOG if i.deferral is not Deferral.NONE}

    assert deferred == {
        "MG-c": Deferral.NEXT_WEEK,
        "MG-g": Deferral.NEXT_WEEK,
        "MG-i": Deferral.NEXT_WEEK_IF_IN_MATCH,
    }


def test_very_serious_without_letter_are_flagged() -> None:
    extras = [i for i in DEFAULT_CATALOG if not i.in_pdf_letter]

    assert len(extras) == 5
    assert all(i.severity is Severity.VERY_SERIOUS for i in extras)


def test_late_to_a_call_up_proposes_not_playing_that_match() -> None:
    sanction = catalog_by_code()["MG-c"].sanction

    assert sanction is not None
    assert (sanction.kind, sanction.min_matches, sanction.max_matches) == (
        SanctionKind.NO_PLAY,
        1,
        1,
    )


def test_catalog_by_code_indexes_every_entry() -> None:
    assert len(catalog_by_code()) == len(DEFAULT_CATALOG)
