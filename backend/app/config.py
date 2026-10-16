"""Configuración desde variables de entorno."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

LOCAL_DEV_DATABASE_URL = "postgresql+asyncpg://futsal:futsal@localhost:54329/futsal"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    database_url: str = LOCAL_DEV_DATABASE_URL
    # Migraciones: conexión directa o session pooler (puerto 5432), nunca el pooler de transacción.
    direct_database_url: str | None = None

    @property
    def migrations_database_url(self) -> str:
        return self.direct_database_url or self.database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()
