import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

import app.main as main_module
from app.config import Settings, get_settings

ORIGIN = "http://localhost:3000"


def settings_with(**overrides: object) -> Settings:
    return Settings(_env_file=None, **overrides)  # type: ignore[arg-type]


def app_with_prefix(monkeypatch: pytest.MonkeyPatch, api_prefix: str) -> FastAPI:
    settings = settings_with(api_prefix=api_prefix, cors_origins=[ORIGIN])
    monkeypatch.setattr(main_module, "get_settings", lambda: settings)
    application = main_module.create_app()
    application.dependency_overrides[get_settings] = lambda: settings
    return application


async def get_status(application: FastAPI, path: str) -> int:
    async with AsyncClient(transport=ASGITransport(app=application), base_url="http://t") as http:
        return (await http.get(path)).status_code


def test_api_prefix_is_empty_by_default() -> None:
    assert settings_with().api_prefix == ""


@pytest.mark.parametrize("prefix", ["", "/api", "/api/v1"])
def test_valid_prefixes_are_accepted(prefix: str) -> None:
    assert settings_with(api_prefix=prefix).api_prefix == prefix


@pytest.mark.parametrize("prefix", ["api", "/api/", "/"])
def test_prefix_must_start_with_a_slash_and_not_end_with_one(prefix: str) -> None:
    with pytest.raises(ValidationError, match="API_PREFIX"):
        settings_with(api_prefix=prefix)


def test_refresh_cookie_path_follows_the_prefix() -> None:
    assert settings_with().refresh_cookie_path == "/auth"
    assert settings_with(api_prefix="/api").refresh_cookie_path == "/api/auth"


async def test_routes_and_health_are_served_under_the_prefix(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    application = app_with_prefix(monkeypatch, "/api")

    assert await get_status(application, "/api/health") == 200
    assert await get_status(application, "/health") == 404
    assert await get_status(application, "/api/players") == 401
    assert await get_status(application, "/players") == 404


async def test_routes_are_served_at_the_root_without_prefix(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    application = app_with_prefix(monkeypatch, "")

    assert await get_status(application, "/health") == 200
    assert await get_status(application, "/players") == 401


async def test_logout_clears_the_cookie_on_the_prefixed_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    application = app_with_prefix(monkeypatch, "/api")

    async with AsyncClient(transport=ASGITransport(app=application), base_url="http://t") as http:
        response = await http.post("/api/auth/logout", headers={"Origin": ORIGIN})

    assert response.status_code == 200
    assert "Path=/api/auth" in response.headers["set-cookie"]
