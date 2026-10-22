import pytest
from fastapi import FastAPI
from fastapi import Response as FastApiResponse
from httpx import ASGITransport, AsyncClient, Response

from app.main import create_app

ALLOWED_ORIGIN = "http://localhost:3000"


@pytest.fixture
def application() -> FastAPI:
    return create_app()


async def request(application: FastAPI, method: str, path: str, **kwargs: object) -> Response:
    transport = ASGITransport(app=application, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://t") as http:
        return await http.request(method, path, **kwargs)  # type: ignore[arg-type]


def assert_hardened(response: Response) -> None:
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"


async def test_successful_responses_are_not_cacheable_and_not_sniffed(application: FastAPI) -> None:
    assert_hardened(await request(application, "GET", "/health"))


async def test_unauthorized_responses_carry_the_headers(application: FastAPI) -> None:
    response = await request(application, "GET", "/players")

    assert response.status_code == 401
    assert_hardened(response)


async def test_validation_errors_carry_the_headers(application: FastAPI) -> None:
    response = await request(application, "POST", "/auth/login", json={"email": 1})

    assert response.status_code == 422
    assert_hardened(response)


async def test_not_found_responses_carry_the_headers(application: FastAPI) -> None:
    response = await request(application, "GET", "/no-such-route")

    assert response.status_code == 404
    assert_hardened(response)


async def test_unexpected_errors_carry_the_headers(application: FastAPI) -> None:
    @application.get("/boom")
    async def boom() -> None:
        raise RuntimeError("boom")

    response = await request(application, "GET", "/boom")

    assert response.status_code == 500
    assert_hardened(response)


async def test_a_route_cannot_make_its_response_cacheable_by_accident(application: FastAPI) -> None:
    @application.get("/cacheable")
    async def cacheable(response: FastApiResponse) -> dict[str, str]:
        response.headers["Cache-Control"] = "public, max-age=3600"
        return {"ok": "yes"}

    assert_hardened(await request(application, "GET", "/cacheable"))


async def test_cors_headers_still_reach_allowed_origins(application: FastAPI) -> None:
    response = await request(application, "GET", "/health", headers={"Origin": ALLOWED_ORIGIN})

    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert_hardened(response)
