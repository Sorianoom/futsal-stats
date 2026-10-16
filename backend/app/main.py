from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.errors import register_error_handlers
from app.api.routes import auth, callup, matches, movements, players, sessions, stints, sync
from app.auth.passwords import warm_up
from app.auth.rate_limit import LoginGuard
from app.config import get_settings
from app.db.session import dispose_engine

ALLOWED_METHODS = ["GET", "POST", "PATCH", "DELETE"]
ALLOWED_HEADERS = ["Authorization", "Content-Type"]


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    settings.require_jwt_secret()
    settings.validate_for_production()
    warm_up()
    yield
    await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    docs = (
        {"docs_url": None, "redoc_url": None, "openapi_url": None} if settings.is_production else {}
    )
    app = FastAPI(title="Futsal Stats", lifespan=lifespan, **docs)  # type: ignore[arg-type]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=ALLOWED_METHODS,
        allow_headers=ALLOWED_HEADERS,
    )
    app.state.login_guard = LoginGuard()
    register_error_handlers(app)
    app.include_router(auth.router)
    app.include_router(players.router)
    for router in (
        sessions.router,
        movements.router,
        matches.router,
        callup.router,
        sync.router,
        stints.router,
    ):
        app.include_router(router)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
