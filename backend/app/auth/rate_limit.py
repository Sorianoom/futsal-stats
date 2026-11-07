"""Límite de intentos de login fallidos: claves, decisión de bloqueo e IP del cliente.

Los fallos se guardan en la BD (`login_failures_repo`) para que los vean todas las instancias de
la API: en Vercel cada petición puede caer en una función distinta y un contador en memoria no
bloquea de forma fiable. Aquí solo está la parte pura.
"""

import hashlib
import hmac
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import timedelta

WINDOW = timedelta(minutes=5)
PER_PAIR_MAX_FAILURES = 5
PER_IP_MAX_FAILURES = 30
PER_EMAIL_MAX_FAILURES = 20
UNKNOWN_IP = "unknown"
# Vercel sobrescribe esta cabecera con la IP pública del cliente: no se puede falsificar.
# Fuera de Vercel la pone quien quiera, así que solo se lee detrás de su proxy.
VERCEL_CLIENT_IP_HEADER = "x-real-ip"


@dataclass(frozen=True, slots=True)
class LoginKeys:
    """Tres contadores (IP+email, IP y email), para que rotar uno no baste para eludirlos.

    Se guardan como HMAC con el secreto de la app: la tabla no contiene IPs ni emails en claro y,
    sin el secreto, no se pueden recuperar probando todas las IPs.
    """

    pair: str
    ip: str
    email: str


def _digest(scope: str, value: str, secret: str) -> str:
    message = f"{scope}:{value}".encode()
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def login_keys(ip: str, email: str, secret: str) -> LoginKeys:
    normalized = email.strip().lower()
    return LoginKeys(
        pair=_digest("pair", f"{ip}|{normalized}", secret),
        ip=_digest("ip", ip, secret),
        email=_digest("email", normalized, secret),
    )


def is_blocked(keys: LoginKeys, counts: Mapping[str, int]) -> bool:
    """Bloqueado si cualquiera de los tres contadores llega a su límite dentro de la ventana."""
    limits = (
        (keys.pair, PER_PAIR_MAX_FAILURES),
        (keys.ip, PER_IP_MAX_FAILURES),
        (keys.email, PER_EMAIL_MAX_FAILURES),
    )
    return any(counts.get(key, 0) >= limit for key, limit in limits)


def client_ip(socket_host: str | None, headers: Mapping[str, str], behind_vercel: bool) -> str:
    if behind_vercel:
        forwarded = headers.get(VERCEL_CLIENT_IP_HEADER, "").strip()
        if forwarded:
            return forwarded
    return socket_host or UNKNOWN_IP
