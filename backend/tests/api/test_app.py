import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

import app.main as main_module
from app.config import Settings
from app.main import create_app

ALLOWED_ORIGIN = "http://localhost:3000"


@pytest.fixture
def application() -> FastAPI:
    return create_app()


async def test_preflight_from_an_allowed_origin_is_accepted_with_credentials(
    application: FastAPI,
) -> None:
    async with AsyncClient(transport=ASGITransport(app=application), base_url="http://t") as http:
        response = await http.options(
            "/players",
            headers={
                "Origin": ALLOWED_ORIGIN,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"


async def test_preflight_from_another_origin_gets_no_cors_headers(application: FastAPI) -> None:
    async with AsyncClient(transport=ASGITransport(app=application), base_url="http://t") as http:
        response = await http.options(
            "/players",
            headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
        )

    assert "access-control-allow-origin" not in response.headers


async def test_unknown_route_uses_the_error_envelope(application: FastAPI) -> None:
    async with AsyncClient(transport=ASGITransport(app=application), base_url="http://t") as http:
        response = await http.get("/nope")

    assert response.status_code == 404
    assert response.json() == {
        "success": False,
        "data": None,
        "error": {"code": "not_found", "message": "Solicitud no válida"},
        "meta": None,
    }


async def test_unexpected_errors_do_not_leak_details(application: FastAPI) -> None:
    @application.get("/boom")
    async def boom() -> None:
        raise RuntimeError("password=hunter2 in /srv/secret/path")

    transport = ASGITransport(app=application, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://t") as http:
        response = await http.get("/boom")

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "internal_error"
    assert "hunter2" not in response.text
    assert "/srv/secret" not in response.text


async def test_startup_fails_without_a_jwt_secret(
    application: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = Settings(_env_file=None, jwt_secret=None)
    monkeypatch.setattr(main_module, "get_settings", lambda: settings)

    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        async with application.router.lifespan_context(application):
            pass


async def test_startup_succeeds_with_a_valid_secret(
    application: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = Settings(_env_file=None, jwt_secret="Zx9-Qm4_Lp7vWc2Rt8Ys5Uh3Nj6Bk1Dg0Fa")  # type: ignore[arg-type]
    monkeypatch.setattr(main_module, "get_settings", lambda: settings)

    async with application.router.lifespan_context(application):
        pass
