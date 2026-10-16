"""Configuración desde variables de entorno."""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

LOCAL_DEV_DATABASE_URL = "postgresql+asyncpg://futsal:futsal@localhost:54329/futsal"
MIN_JWT_SECRET_LENGTH = 32
MIN_JWT_SECRET_DISTINCT_CHARS = 12
LOCAL_HOSTS = ("localhost", "127.0.0.1", "[::1]")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    app_env: Literal["development", "production"] = "development"
    database_url: str = LOCAL_DEV_DATABASE_URL
    # Migraciones: conexión directa o session pooler (puerto 5432), nunca el pooler de transacción.
    direct_database_url: str | None = None

    jwt_secret: SecretStr | None = None
    jwt_issuer: str = "futsal-stats"
    jwt_audience: str = "futsal-stats-app"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30
    cookie_secure: bool = True

    # Separados por comas en el entorno: CORS_ORIGINS=https://app.club.es,http://localhost:3000
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("cors_origins")
    @classmethod
    def _reject_wildcard(cls, origins: list[str]) -> list[str]:
        if "*" in origins:
            raise ValueError("CORS con credenciales no admite el comodín '*'")
        return origins

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def migrations_database_url(self) -> str:
        return self.direct_database_url or self.database_url

    def require_jwt_secret(self) -> str:
        if self.jwt_secret is None:
            raise RuntimeError("Falta JWT_SECRET en el entorno")
        secret = self.jwt_secret.get_secret_value()
        if len(secret) < MIN_JWT_SECRET_LENGTH:
            raise RuntimeError(f"JWT_SECRET debe tener al menos {MIN_JWT_SECRET_LENGTH} caracteres")
        if len(set(secret)) < MIN_JWT_SECRET_DISTINCT_CHARS:
            raise RuntimeError("JWT_SECRET es demasiado simple: genera uno aleatorio")
        return secret

    def validate_for_production(self) -> None:
        """En producción no se admiten los valores por defecto de desarrollo."""
        if not self.is_production:
            return
        self.require_jwt_secret()
        if self.database_url == LOCAL_DEV_DATABASE_URL:
            raise RuntimeError("Falta DATABASE_URL: en producción no se usa la BD local")
        if any(host in origin for origin in self.cors_origins for host in LOCAL_HOSTS):
            raise RuntimeError("CORS_ORIGINS no puede incluir localhost en producción")
        if not all(origin.startswith("https://") for origin in self.cors_origins):
            raise RuntimeError("CORS_ORIGINS debe usar https:// en producción")
        if not self.cookie_secure:
            raise RuntimeError("COOKIE_SECURE debe ser true en producción")


@lru_cache
def get_settings() -> Settings:
    return Settings()
