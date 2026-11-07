"""Tokens de invitación de jugadores: aleatorios, de un solo uso y guardados solo como hash."""

import hashlib
import secrets
from datetime import timedelta

INVITATION_TTL = timedelta(days=7)
TOKEN_BYTES = 32
MAX_TOKEN_LENGTH = 128


def new_invitation_token() -> str:
    return secrets.token_urlsafe(TOKEN_BYTES)


def hash_invitation_token(token: str) -> str:
    """sha256 basta (sin sal ni coste): el token tiene 256 bits de entropía."""
    return hashlib.sha256(token.encode()).hexdigest()
