"""Fotos de jugadores servidas sin sesión: el enlace lleva un token aleatorio que cambia con cada
foto, así que una `<img>` las carga sin token de acceso y el navegador las guarda en caché."""

import uuid

from fastapi import APIRouter, Response

from app.api.deps import SessionDep
from app.api.errors import ApiError
from app.db import photos_repo

router = APIRouter(prefix=photos_repo.PHOTO_PATH, tags=["photos"])

# `private`: la guarda el navegador, no una caché compartida. Un token nuevo es una foto nueva.
PHOTO_CACHE_CONTROL = "private, max-age=31536000, immutable"


@router.get("/{token}")
async def get_photo(token: str, session: SessionDep) -> Response:
    try:
        parsed = uuid.UUID(token)
    except ValueError as error:
        raise ApiError(404, "not_found", "Foto no encontrada") from error
    photo = await photos_repo.photo_by_token(session, parsed)
    if photo is None:
        raise ApiError(404, "not_found", "Foto no encontrada")
    return Response(
        content=photo.content,
        media_type=photo.content_type,
        headers={"Cache-Control": PHOTO_CACHE_CONTROL},
    )
