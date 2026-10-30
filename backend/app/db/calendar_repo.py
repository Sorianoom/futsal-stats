"""Alta de partidos a partir de un calendario, sin duplicar los que ya existen."""

from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import points_repo
from app.domain.calendar_import import CalendarEntry


@dataclass(frozen=True)
class ImportResult:
    created: int
    existing: int


async def import_matches(
    db: AsyncSession, entries: Sequence[CalendarEntry], *, dry_run: bool = False
) -> ImportResult:
    """Crea un partido por entrada, salvo los que ya existen (misma fecha y rival)."""
    known = {
        (held_on, match.opponent.casefold())
        for match, held_on in await points_repo.list_matches(db)
    }
    created = 0
    existing = 0
    for entry in entries:
        key = (entry.held_on, entry.opponent.casefold())
        if key in known:
            existing += 1
            continue
        if not dry_run:
            await points_repo.create_match(db, entry.held_on, entry.opponent)
        known.add(key)
        created += 1
    return ImportResult(created=created, existing=existing)
