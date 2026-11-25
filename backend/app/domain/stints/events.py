"""Registro de eventos de partido de solo añadir. Deshacer = evento compensatorio."""

from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum


class EventError(ValueError):
    """Registro de eventos incoherente."""


class EventKind(StrEnum):
    GOAL = "goal"
    ASSIST = "assist"
    SHOT = "shot"
    TURNOVER = "turnover"
    STEAL = "steal"
    KEY_ACTION = "key_action"  # acción clave: balón salvado bajo la línea, recuperación clave
    FOUL = "foul"
    YELLOW = "yellow"
    RED = "red"
    SAVE = "save"  # parada del portero; lleva el jugador como el resto de acciones
    RIVAL_GOAL = "rival_goal"
    UNDO = "undo"


@dataclass(frozen=True, slots=True)
class MatchEvent:
    id: str
    kind: EventKind
    part: int
    t: int
    player_id: str | None = None
    voids: str | None = None


def effective_events(events: Iterable[MatchEvent]) -> tuple[MatchEvent, ...]:
    log = tuple(events)
    seen: dict[str, MatchEvent] = {}
    voided: set[str] = set()
    for event in log:
        if event.id in seen:
            raise EventError(f"Id de evento duplicado: {event.id}")
        if event.kind is EventKind.UNDO:
            _register_void(event, seen, voided)
        seen[event.id] = event
    return tuple(e for e in log if e.kind is not EventKind.UNDO and e.id not in voided)


def _register_void(event: MatchEvent, seen: dict[str, MatchEvent], voided: set[str]) -> None:
    target_id = event.voids
    if target_id is None:
        raise EventError(f"El evento {event.id} deshace algo pero no indica qué")
    target = seen.get(target_id)
    if target is None:
        raise EventError(f"El evento {event.id} deshace uno desconocido: {target_id}")
    if target.kind is EventKind.UNDO:
        raise EventError(f"No se puede deshacer un deshacer: {target_id}")
    if target_id in voided:
        raise EventError(f"El evento {target_id} ya estaba deshecho")
    voided.add(target_id)


def undo_target(events: Iterable[MatchEvent]) -> MatchEvent | None:
    effective = effective_events(events)
    return effective[-1] if effective else None


def team_fouls_by_part(events: Iterable[MatchEvent]) -> dict[int, int]:
    fouls = Counter(e.part for e in effective_events(events) if e.kind is EventKind.FOUL)
    return dict(fouls)


def counts_by_player(events: Iterable[MatchEvent]) -> dict[str, dict[EventKind, int]]:
    counts: dict[str, Counter[EventKind]] = {}
    for event in effective_events(events):
        if event.player_id is None:
            continue
        counts.setdefault(event.player_id, Counter())[event.kind] += 1
    return {player: dict(counter) for player, counter in counts.items()}
