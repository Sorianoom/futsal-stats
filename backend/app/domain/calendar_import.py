"""Lectura del calendario de partidos: una línea por partido, `AAAA-MM-DD Rival`."""

from dataclasses import dataclass
from datetime import date

MAX_OPPONENT_LENGTH = 100
ISO_DATE_LENGTH = len("2026-11-08")
COMMENT_PREFIX = "#"


class CalendarError(ValueError):
    """El texto del calendario no se puede leer; el mensaje indica la línea."""


@dataclass(frozen=True)
class CalendarEntry:
    held_on: date
    opponent: str


def _parse_line(number: int, line: str) -> CalendarEntry:
    day, _, rest = line.partition(" ")
    try:
        # `fromisoformat` también admite `20261108` o `2026-W45-1`: aquí solo vale AAAA-MM-DD.
        if len(day) != ISO_DATE_LENGTH:
            raise ValueError(day)
        held_on = date.fromisoformat(day)
    except ValueError as error:
        raise CalendarError(f"Línea {number}: la fecha «{day}» no es AAAA-MM-DD") from error
    opponent = " ".join(rest.split())
    if not opponent:
        raise CalendarError(f"Línea {number}: falta el rival")
    if len(opponent) > MAX_OPPONENT_LENGTH:
        raise CalendarError(f"Línea {number}: el rival supera los {MAX_OPPONENT_LENGTH} caracteres")
    return CalendarEntry(held_on=held_on, opponent=opponent)


def parse_calendar(text: str) -> list[CalendarEntry]:
    """Los partidos del texto, en su orden. Ignora líneas vacías y comentarios (`#`)."""
    entries: list[CalendarEntry] = []
    seen: set[tuple[date, str]] = set()
    for number, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith(COMMENT_PREFIX):
            continue
        entry = _parse_line(number, line)
        key = (entry.held_on, entry.opponent.casefold())
        if key in seen:
            raise CalendarError(f"Línea {number}: partido repetido")
        seen.add(key)
        entries.append(entry)
    if not entries:
        raise CalendarError("El calendario no contiene ningún partido")
    return entries
