from app.config import LOCAL_DEV_DATABASE_URL, Settings
from app.db.engine import engine_options

POOLER_URL = "postgresql+asyncpg://u:p@aws-0-eu.pooler.supabase.com:6543/postgres"


def test_engine_disables_every_prepared_statement_cache() -> None:
    url, options = engine_options(POOLER_URL)

    assert url.query["prepared_statement_cache_size"] == "0"
    assert options["connect_args"]["statement_cache_size"] == 0


def test_prepared_statement_names_are_unique_per_call() -> None:
    _, options = engine_options(POOLER_URL)
    name_func = options["connect_args"]["prepared_statement_name_func"]

    assert name_func() != name_func()


def test_migrations_use_the_direct_url_when_configured() -> None:
    settings = Settings(database_url=POOLER_URL, direct_database_url="postgresql+asyncpg://direct")

    assert settings.migrations_database_url == "postgresql+asyncpg://direct"


def test_migrations_fall_back_to_the_app_url() -> None:
    settings = Settings(database_url=POOLER_URL, direct_database_url=None)

    assert settings.migrations_database_url == POOLER_URL


def test_default_url_points_to_the_local_docker_database() -> None:
    assert Settings(_env_file=None).database_url == LOCAL_DEV_DATABASE_URL
