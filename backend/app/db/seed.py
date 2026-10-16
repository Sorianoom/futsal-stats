"""Comando `uv run python -m app.db.seed`: carga el catálogo de faltas y reglas de asistencia."""

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.catalog_repo import seed_catalog
from app.db.engine import build_engine


async def main() -> None:
    engine = build_engine(get_settings().migrations_database_url, pooled=False)
    try:
        async with AsyncSession(engine) as session, session.begin():
            await seed_catalog(session)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
