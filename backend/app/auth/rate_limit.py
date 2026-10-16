"""Límites de intentos de login fallidos en memoria (por instancia de la API)."""

import time
from collections import deque
from collections.abc import Callable

DEFAULT_MAX_FAILURES = 5
DEFAULT_WINDOW_SECONDS = 300
DEFAULT_MAX_KEYS = 10_000
PER_IP_MAX_FAILURES = 30
PER_EMAIL_MAX_FAILURES = 20


class LoginRateLimiter:
    def __init__(
        self,
        max_failures: int = DEFAULT_MAX_FAILURES,
        window_seconds: float = DEFAULT_WINDOW_SECONDS,
        clock: Callable[[], float] = time.monotonic,
        max_keys: int = DEFAULT_MAX_KEYS,
    ) -> None:
        self._max_failures = max_failures
        self._window_seconds = window_seconds
        self._clock = clock
        self._max_keys = max_keys
        self._failures: dict[str, deque[float]] = {}

    def _recent(self, key: str) -> deque[float] | None:
        """Fallos dentro de la ventana; olvida la clave si ya no quedan (no crece sin límite)."""
        failures = self._failures.get(key)
        if failures is None:
            return None
        cutoff = self._clock() - self._window_seconds
        while failures and failures[0] <= cutoff:
            failures.popleft()
        if not failures:
            del self._failures[key]
            return None
        return failures

    def is_blocked(self, key: str) -> bool:
        failures = self._recent(key)
        return failures is not None and len(failures) >= self._max_failures

    def record_failure(self, key: str) -> None:
        failures = self._recent(key)
        if failures is None:
            failures = self._failures.setdefault(key, deque())
            self._evict_oldest_keys()
        failures.append(self._clock())

    def _evict_oldest_keys(self) -> None:
        while len(self._failures) > self._max_keys:
            del self._failures[next(iter(self._failures))]

    def reset(self, key: str) -> None:
        self._failures.pop(key, None)


class LoginGuard:
    """Combina tres contadores: IP+email, IP y email, para que rotar uno no baste para eludirlos."""

    def __init__(
        self,
        per_pair: int = DEFAULT_MAX_FAILURES,
        per_ip: int = PER_IP_MAX_FAILURES,
        per_email: int = PER_EMAIL_MAX_FAILURES,
        window_seconds: float = DEFAULT_WINDOW_SECONDS,
        clock: Callable[[], float] = time.monotonic,
        max_keys: int = DEFAULT_MAX_KEYS,
    ) -> None:
        self.window_seconds = window_seconds
        self._pairs = LoginRateLimiter(per_pair, window_seconds, clock, max_keys)
        self._ips = LoginRateLimiter(per_ip, window_seconds, clock, max_keys)
        self._emails = LoginRateLimiter(per_email, window_seconds, clock, max_keys)

    @staticmethod
    def _pair(ip: str, email: str) -> str:
        return f"{ip}|{email.strip().lower()}"

    def is_blocked(self, ip: str, email: str) -> bool:
        normalized = email.strip().lower()
        return (
            self._pairs.is_blocked(self._pair(ip, email))
            or self._ips.is_blocked(ip)
            or self._emails.is_blocked(normalized)
        )

    def record_failure(self, ip: str, email: str) -> None:
        self._pairs.record_failure(self._pair(ip, email))
        self._ips.record_failure(ip)
        self._emails.record_failure(email.strip().lower())

    def reset(self, ip: str, email: str) -> None:
        """Un login correcto limpia el par y el email, pero no el contador de la IP."""
        self._pairs.reset(self._pair(ip, email))
        self._emails.reset(email.strip().lower())
