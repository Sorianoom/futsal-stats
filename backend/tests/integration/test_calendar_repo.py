from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import points_repo
from app.db.calendar_repo import ImportResult, import_matches
from app.domain.calendar_import import CalendarEntry

NEVADA = CalendarEntry(date(2026, 11, 8), "Nevada Eagles")
MOTRIL = CalendarEntry(date(2026, 11, 15), "Puerto de Motril")


async def stored(session: AsyncSession) -> list[tuple[date, str]]:
    rows = await points_repo.list_matches(session)
    return sorted((held_on, match.opponent) for match, held_on in rows)


async def test_creates_a_match_for_each_entry(session: AsyncSession) -> None:
    result = await import_matches(session, [NEVADA, MOTRIL])

    assert result == ImportResult(created=2, existing=0)
    assert await stored(session) == [
        (date(2026, 11, 8), "Nevada Eagles"),
        (date(2026, 11, 15), "Puerto de Motril"),
    ]


async def test_does_not_duplicate_matches_already_stored(session: AsyncSession) -> None:
    await import_matches(session, [NEVADA])

    result = await import_matches(session, [NEVADA, MOTRIL])

    assert result == ImportResult(created=1, existing=1)
    assert len(await stored(session)) == 2


async def test_recognises_an_existing_match_ignoring_letter_case(session: AsyncSession) -> None:
    await points_repo.create_match(session, date(2026, 11, 8), "nevada eagles")

    result = await import_matches(session, [NEVADA])

    assert result == ImportResult(created=0, existing=1)


async def test_the_same_rival_on_another_date_is_a_new_match(session: AsyncSession) -> None:
    await import_matches(session, [NEVADA])

    result = await import_matches(session, [CalendarEntry(date(2027, 1, 24), "Nevada Eagles")])

    assert result == ImportResult(created=1, existing=0)


async def test_an_entry_repeated_in_the_same_call_is_created_once(session: AsyncSession) -> None:
    result = await import_matches(session, [NEVADA, NEVADA])

    assert result == ImportResult(created=1, existing=1)
    assert len(await stored(session)) == 1


async def test_a_dry_run_counts_without_writing(session: AsyncSession) -> None:
    await import_matches(session, [NEVADA])

    result = await import_matches(session, [NEVADA, MOTRIL], dry_run=True)

    assert result == ImportResult(created=1, existing=1)
    assert len(await stored(session)) == 1
