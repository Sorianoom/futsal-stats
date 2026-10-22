"""Errores de API y su conversión al envoltorio estándar. Nada interno se filtra al cliente."""

import logging
from collections.abc import Mapping

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.envelope import failure
from app.api.security_headers import SECURITY_HEADERS

logger = logging.getLogger(__name__)

STATUS_CODES = {
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    429: "too_many_attempts",
}


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.headers = dict(headers or {})


def _json(
    status_code: int, code: str, message: str, headers: Mapping[str, str] | None = None
) -> JSONResponse:
    body = failure(code, message).model_dump()
    # Las cabeceras de seguridad van aquí también: Starlette sirve el 500 no controlado desde su
    # capa más externa, que no pasa por SecurityHeadersMiddleware.
    return JSONResponse(
        body, status_code=status_code, headers={**(headers or {}), **SECURITY_HEADERS}
    )


async def _handle_api_error(_: Request, error: Exception) -> JSONResponse:
    assert isinstance(error, ApiError)
    return _json(error.status_code, error.code, error.message, error.headers)


async def _handle_http_error(_: Request, error: Exception) -> JSONResponse:
    assert isinstance(error, StarletteHTTPException)
    code = STATUS_CODES.get(error.status_code, "error")
    return _json(error.status_code, code, "Solicitud no válida", error.headers)


async def _handle_validation_error(_: Request, error: Exception) -> JSONResponse:
    assert isinstance(error, RequestValidationError)
    fields = sorted(
        {".".join(str(part) for part in e["loc"][1:]) or "body" for e in error.errors()}
    )
    return _json(422, "validation_error", f"Datos no válidos: {', '.join(fields)}")


async def _handle_unexpected(request: Request, error: Exception) -> JSONResponse:
    logger.exception(
        "Error no controlado en %s %s", request.method, request.url.path, exc_info=error
    )
    return _json(500, "internal_error", "Error interno del servidor")


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _handle_api_error)
    app.add_exception_handler(StarletteHTTPException, _handle_http_error)
    app.add_exception_handler(RequestValidationError, _handle_validation_error)
    app.add_exception_handler(Exception, _handle_unexpected)
