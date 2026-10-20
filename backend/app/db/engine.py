"""Motor async compatible con el pooler de transacción de Neon (sin prepared statements)."""

from typing import Any
from uuid import uuid4

from sqlalchemy.engine import URL, make_url
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.pool import NullPool

POOL_SIZE = 5
MAX_OVERFLOW = 5


def _unique_statement_name() -> str:
    return f"__asyncpg_{uuid4()}__"


def engine_options(url: str) -> tuple[URL, dict[str, Any]]:
    """URL y kwargs sin caché de statements, aptos para PgBouncer en modo transacción."""
    parsed = make_url(url).update_query_dict({"prepared_statement_cache_size": "0"})
    connect_args = {
        "statement_cache_size": 0,
        "prepared_statement_name_func": _unique_statement_name,
    }
    return parsed, {"connect_args": connect_args}


def build_engine(url: str, *, pooled: bool = True) -> AsyncEngine:
    parsed, options = engine_options(url)
    if pooled:
        options = {
            **options,
            "pool_size": POOL_SIZE,
            "max_overflow": MAX_OVERFLOW,
            "pool_pre_ping": True,
        }
    else:
        options = {**options, "poolclass": NullPool}
    return create_async_engine(parsed, **options)
