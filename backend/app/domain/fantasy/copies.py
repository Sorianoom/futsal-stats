"""Copias de los jugadores reales y reparto al azar de las plantillas iniciales."""

import random
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from app.domain.fantasy.rules import COPIES_PER_FIELD_PLAYER, COPIES_PER_GOALKEEPER
from app.domain.points.callup import Position

FIRST_COPY_NUMBER = 1


def copies_per_player(position: Position) -> int:
    return COPIES_PER_GOALKEEPER if position is Position.GOALKEEPER else COPIES_PER_FIELD_PLAYER


def missing_copies(
    players: Iterable[tuple[str, Position]], players_with_copies: set[str]
) -> list[tuple[str, int]]:
    """(jugador, número de copia) que faltan: todas las de los jugadores que aún no tienen."""
    return [
        (player_id, number)
        for player_id, position in players
        if player_id not in players_with_copies
        for number in range(FIRST_COPY_NUMBER, FIRST_COPY_NUMBER + copies_per_player(position))
    ]


@dataclass(frozen=True, slots=True)
class FreeCopy:
    copy_id: str
    player_id: str
    copy_number: int


def deal_copies(
    recipients: Sequence[str], free: Sequence[FreeCopy], per_recipient: int, rng: random.Random
) -> dict[str, list[str]]:
    """Reparte a cada destinatario copias libres de `per_recipient` jugadores distintos, por
    sorteo puro. El orden de los destinatarios también se sortea: si no hay copias para todos,
    los últimos reciben las que queden."""
    pool: dict[str, list[FreeCopy]] = {}
    for copy in sorted(free, key=lambda c: (c.player_id, c.copy_number)):
        pool.setdefault(copy.player_id, []).append(copy)
    order = list(recipients)
    rng.shuffle(order)
    dealt: dict[str, list[str]] = {}
    for recipient in order:
        available = sorted(p for p, copies in pool.items() if copies)
        chosen = rng.sample(available, min(per_recipient, len(available)))
        dealt[recipient] = [pool[player_id].pop(0).copy_id for player_id in chosen]
    return dealt
