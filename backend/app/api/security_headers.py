"""Cabeceras que llevan todas las respuestas de la API, también las de error."""

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

# Los datos son de sesión y no deben guardarse en ninguna caché (la del navegador, la de una red
# compartida o la del CDN); `nosniff` evita que el navegador reinterprete el JSON como otra cosa.
SECURITY_HEADERS: dict[str, str] = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
}


# Las fotos de jugadores sí se cachean (en el navegador): su enlace cambia con cada foto.
CACHEABLE_PATH_MARKER = "/player-photos/"


class SecurityHeadersMiddleware:
    """Pone SECURITY_HEADERS en cada respuesta HTTP, pisando lo que haya puesto una ruta."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                cacheable = CACHEABLE_PATH_MARKER in scope["path"] and "Cache-Control" in headers
                for name, value in SECURITY_HEADERS.items():
                    if name == "Cache-Control" and cacheable:
                        continue
                    headers[name] = value
            await send(message)

        await self.app(scope, receive, send_with_headers)
