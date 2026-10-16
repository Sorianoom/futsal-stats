from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.catalog_repo import load_attendance_rules, load_catalog, seed_catalog
from app.db.models import AttendanceRuleRow, InfractionRow
from app.domain.points.attendance import DEFAULT_ATTENDANCE_RULES
from app.domain.points.default_catalog import DEFAULT_CATALOG, catalog_by_code


async def count(session: AsyncSession, model: type) -> int:
    return (await session.execute(select(func.count()).select_from(model))).scalar_one()


async def test_seed_inserts_the_whole_catalog_and_rules(session: AsyncSession) -> None:
    await seed_catalog(session)

    assert await count(session, InfractionRow) == len(DEFAULT_CATALOG)
    assert await count(session, AttendanceRuleRow) == len(DEFAULT_ATTENDANCE_RULES)


async def test_seed_is_idempotent(session: AsyncSession) -> None:
    await seed_catalog(session)
    await seed_catalog(session)

    assert await count(session, InfractionRow) == len(DEFAULT_CATALOG)
    assert await count(session, AttendanceRuleRow) == len(DEFAULT_ATTENDANCE_RULES)


async def test_seed_restores_a_value_changed_by_hand(session: AsyncSession) -> None:
    await seed_catalog(session)
    row = await session.get(InfractionRow, "L-a")
    assert row is not None
    row.points = -1
    await session.flush()

    await seed_catalog(session)
    await session.refresh(row)

    assert row.points == -3


async def test_loaded_catalog_equals_the_domain_catalog(session: AsyncSession) -> None:
    await seed_catalog(session)

    assert await load_catalog(session) == catalog_by_code()


async def test_loaded_attendance_rules_keep_their_evaluation_order(session: AsyncSession) -> None:
    await seed_catalog(session)

    assert await load_attendance_rules(session) == DEFAULT_ATTENDANCE_RULES
