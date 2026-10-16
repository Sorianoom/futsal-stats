"""Transiciones puras del quinteto en pista. Cada función devuelve un estado nuevo."""

from collections.abc import Iterable
from dataclasses import dataclass, replace

from app.domain.stints.models import VALID_PARTS, OpenStint, Stint

FULL_TEAM_ON_COURT = 5


class LineupError(ValueError):
    """Operación imposible sobre la alineación actual."""


@dataclass(frozen=True, slots=True)
class LineupState:
    current_part: int | None = None
    last_ended_part: int = 0
    clock: int = 0
    open_stints: frozenset[OpenStint] = frozenset()
    closed_stints: tuple[Stint, ...] = ()
    sent_off: frozenset[str] = frozenset()

    @property
    def on_court(self) -> frozenset[str]:
        return frozenset(s.player_id for s in self.open_stints)

    @property
    def capacity(self) -> int:
        return FULL_TEAM_ON_COURT - len(self.sent_off)


@dataclass(frozen=True, slots=True)
class PartStarted:
    part: int
    starters: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class Substituted:
    t: int
    player_out: str
    player_in: str


@dataclass(frozen=True, slots=True)
class SentOff:
    t: int
    player_id: str


@dataclass(frozen=True, slots=True)
class PartEnded:
    t: int


LineupEvent = PartStarted | Substituted | SentOff | PartEnded


def _require_part_in_progress(state: LineupState, t: int) -> int:
    if state.current_part is None:
        raise LineupError("No hay ninguna parte en juego")
    if t < state.clock:
        raise LineupError(f"El tiempo {t}s es anterior al reloj actual {state.clock}s")
    return state.current_part


type _Stints = tuple[frozenset[OpenStint], tuple[Stint, ...]]


def _close(
    open_stints: frozenset[OpenStint], closed: tuple[Stint, ...], player_id: str, t: int
) -> _Stints:
    opened = next(s for s in open_stints if s.player_id == player_id)
    remaining = open_stints - {opened}
    if t == opened.start:
        return remaining, closed
    return remaining, (*closed, Stint(player_id, opened.part, opened.start, t))


def start_part(state: LineupState, part: int, starters: Iterable[str]) -> LineupState:
    lineup = tuple(starters)
    if part not in VALID_PARTS:
        raise LineupError(f"Parte inválida: {part}")
    if state.current_part is not None:
        raise LineupError("Ya hay una parte en juego")
    if part != state.last_ended_part + 1:
        raise LineupError(f"La parte {part} no puede empezar tras la parte {state.last_ended_part}")
    if len(set(lineup)) != len(lineup):
        raise LineupError("Titulares duplicados")
    if len(lineup) > state.capacity:
        raise LineupError(f"Hay {len(lineup)} titulares y la capacidad es {state.capacity}")
    if state.sent_off.intersection(lineup):
        raise LineupError("Un jugador expulsado no puede ser titular")
    opened = frozenset(OpenStint(player, part, 0) for player in lineup)
    return replace(state, current_part=part, clock=0, open_stints=opened)


def substitute(state: LineupState, t: int, player_out: str, player_in: str) -> LineupState:
    part = _require_part_in_progress(state, t)
    if player_out not in state.on_court:
        raise LineupError(f"{player_out} no está en pista")
    if player_in in state.on_court:
        raise LineupError(f"{player_in} ya está en pista")
    if player_in in state.sent_off:
        raise LineupError(f"{player_in} está expulsado")
    remaining, closed = _close(state.open_stints, state.closed_stints, player_out, t)
    return replace(
        state,
        clock=t,
        open_stints=remaining | {OpenStint(player_in, part, t)},
        closed_stints=closed,
    )


def send_off(state: LineupState, t: int, player_id: str) -> LineupState:
    _require_part_in_progress(state, t)
    if player_id not in state.on_court:
        raise LineupError(f"{player_id} no está en pista")
    remaining, closed = _close(state.open_stints, state.closed_stints, player_id, t)
    return replace(
        state,
        clock=t,
        open_stints=remaining,
        closed_stints=closed,
        sent_off=state.sent_off | {player_id},
    )


def end_part(state: LineupState, t: int) -> LineupState:
    part = _require_part_in_progress(state, t)
    remaining, closed = state.open_stints, state.closed_stints
    for player_id in sorted(state.on_court):
        remaining, closed = _close(remaining, closed, player_id, t)
    return replace(
        state,
        current_part=None,
        last_ended_part=part,
        clock=t,
        open_stints=remaining,
        closed_stints=closed,
    )


def apply_event(state: LineupState, event: LineupEvent) -> LineupState:
    match event:
        case PartStarted(part, starters):
            return start_part(state, part, starters)
        case Substituted(t, player_out, player_in):
            return substitute(state, t, player_out, player_in)
        case SentOff(t, player_id):
            return send_off(state, t, player_id)
        case PartEnded(t):
            return end_part(state, t)


def replay(events: Iterable[LineupEvent]) -> LineupState:
    state = LineupState()
    for event in events:
        state = apply_event(state, event)
    return state
