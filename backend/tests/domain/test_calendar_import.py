from datetime import date

import pytest

from app.domain.calendar_import import CalendarEntry, CalendarError, parse_calendar


def test_parses_one_match_per_line() -> None:
    entries = parse_calendar("2026-11-08 Nevada Eagles\n2026-11-15 Puerto de Motril\n")

    assert entries == [
        CalendarEntry(held_on=date(2026, 11, 8), opponent="Nevada Eagles"),
        CalendarEntry(held_on=date(2026, 11, 15), opponent="Puerto de Motril"),
    ]


def test_ignores_blank_lines_and_comments() -> None:
    text = "# Calendario 2026/27\n\n2026-11-08 Nevada Eagles\n   \n# fin\n"

    assert parse_calendar(text) == [CalendarEntry(date(2026, 11, 8), "Nevada Eagles")]


def test_collapses_extra_whitespace_in_the_opponent() -> None:
    entries = parse_calendar("2026-11-08    Botellines   de  Lanjarón  ")

    assert entries[0].opponent == "Botellines de Lanjarón"


def test_reports_an_invalid_date_with_its_line_number() -> None:
    with pytest.raises(CalendarError, match="Línea 2.*fecha"):
        parse_calendar("2026-11-08 Nevada Eagles\n2026-13-40 Otro")


def test_only_accepts_the_dashed_date_format() -> None:
    with pytest.raises(CalendarError, match="Línea 1.*AAAA-MM-DD"):
        parse_calendar("20261108 Nevada Eagles")


def test_reports_a_missing_opponent() -> None:
    with pytest.raises(CalendarError, match="Línea 1.*rival"):
        parse_calendar("2026-11-08")


def test_reports_an_opponent_that_is_too_long() -> None:
    with pytest.raises(CalendarError, match="Línea 1.*100"):
        parse_calendar(f"2026-11-08 {'x' * 101}")


def test_reports_a_repeated_match() -> None:
    with pytest.raises(CalendarError, match="Línea 2.*repetido"):
        parse_calendar("2026-11-08 Nevada Eagles\n2026-11-08 nevada eagles")


def test_an_empty_calendar_is_an_error() -> None:
    with pytest.raises(CalendarError, match="ningún partido"):
        parse_calendar("# solo comentarios\n")
