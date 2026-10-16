import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

import app.main as main_module
from app.config import LOCAL_DEV_DATABASE_URL, Settings

STRONG_SECRET = "Zx9-Qm4_Lp7vWc2Rt8Ys5Uh3Nj6Bk1Dg0Fa"
PRODUCTION = {
    "app_env": "production",
    "jwt_secret": STRONG_SECRET,
    "database_url": "postgresql+asyncpg://u:p@db.example.com:6543/postgres",
    "cors_origins": ["https://app.club.es"],
    "cookie_secure": True,
}


def production(**overrides: object) -> Settings:
    return Settings(_env_file=None, **{**PRODUCTION, **overrides})  # type: ignore[arg-type]


def test_a_complete_production_config_is_valid() -> None:
    production().validate_for_production()


def test_development_config_is_never_checked() -> None:
    Settings(_env_file=None, jwt_secret=STRONG_SECRET).validate_for_production()  # type: ignore[arg-type]


def test_production_rejects_the_default_database() -> None:
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        production(database_url=LOCAL_DEV_DATABASE_URL).validate_for_production()


def test_production_rejects_localhost_origins() -> None:
    with pytest.raises(RuntimeError, match="CORS_ORIGINS"):
        production(cors_origins=["http://localhost:3000"]).validate_for_production()


def test_production_rejects_plain_http_origins() -> None:
    with pytest.raises(RuntimeError, match="https"):
        production(cors_origins=["http://app.club.es"]).validate_for_production()


def test_production_requires_secure_cookies() -> None:
    with pytest.raises(RuntimeError, match="COOKIE_SECURE"):
        production(cookie_secure=False).validate_for_production()


@pytest.mark.parametrize("secret", ["a" * 40, "ab" * 20, "12345678" * 5])
def test_trivial_secrets_are_rejected(secret: str) -> None:
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        Settings(_env_file=None, jwt_secret=secret).require_jwt_secret()  # type: ignore[arg-type]


async def test_docs_are_hidden_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main_module, "get_settings", lambda: production())
    application: FastAPI = main_module.create_app()

    async with AsyncClient(transport=ASGITransport(app=application), base_url="http://t") as http:
        statuses = [
            (await http.get(path)).status_code for path in ("/docs", "/redoc", "/openapi.json")
        ]

    assert statuses == [404, 404, 404]


async def test_docs_are_available_in_development() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=main_module.create_app()), base_url="http://t"
    ) as http:
        response = await http.get("/openapi.json")

    assert response.status_code == 200


async def test_startup_validates_the_production_config(monkeypatch: pytest.MonkeyPatch) -> None:
    broken = production(cookie_secure=False)
    monkeypatch.setattr(main_module, "get_settings", lambda: broken)
    application = main_module.create_app()

    with pytest.raises(RuntimeError, match="COOKIE_SECURE"):
        async with application.router.lifespan_context(application):
            pass
