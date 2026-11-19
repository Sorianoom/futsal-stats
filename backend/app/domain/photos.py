"""Fotos de jugadores: qué se acepta. El navegador ya las recorta y reduce antes de subirlas."""

# Una foto reducida en el navegador ocupa unos 20-40 KB; esto deja margen sin llenar la BD.
MAX_PHOTO_BYTES = 300 * 1024

_SIGNATURES: dict[str, tuple[bytes, ...]] = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
}


def is_valid_photo(data: bytes, content_type: str) -> bool:
    """True si los bytes son de verdad del tipo declarado (JPEG, PNG o WebP).

    Se comprueba la firma del fichero para no servir nunca algo distinto de lo que dice ser.
    """
    if content_type == "image/webp":
        return len(data) > 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    signatures = _SIGNATURES.get(content_type)
    return signatures is not None and data.startswith(signatures)
