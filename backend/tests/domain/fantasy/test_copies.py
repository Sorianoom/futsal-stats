"""Copias de cada jugador y reparto al azar de las plantillas iniciales."""

import random

from app.domain.fantasy.copies import FreeCopy, copies_per_player, deal_copies, missing_copies
from app.domain.fantasy.rules import COPIES_PER_FIELD_PLAYER, COPIES_PER_GOALKEEPER
from app.domain.points.callup import Position


def test_goalkeepers_have_eight_copies_and_field_players_five() -> None:
    assert copies_per_player(Position.GOALKEEPER) == COPIES_PER_GOALKEEPER == 8
    assert copies_per_player(Position.FIELD) == COPIES_PER_FIELD_PLAYER == 5


def test_missing_copies_are_created_only_for_players_without_copies() -> None:
    players = [("gk", Position.GOALKEEPER), ("a", Position.FIELD), ("b", Position.FIELD)]

    missing = missing_copies(players, players_with_copies={"b"})

    assert missing == [("gk", n) for n in range(1, 9)] + [("a", n) for n in range(1, 6)]


def _bank(players: int, copies: int) -> list[FreeCopy]:
    return [
        FreeCopy(copy_id=f"p{p}-{n}", player_id=f"p{p}", copy_number=n)
        for p in range(players)
        for n in range(1, copies + 1)
    ]


def test_each_recipient_gets_copies_of_different_players() -> None:
    dealt = deal_copies(["u1", "u2", "u3"], _bank(4, 5), 2, random.Random(1))

    for copies in dealt.values():
        players = {c.split("-")[0] for c in copies}
        assert len(copies) == 2 and len(players) == 2
    every_copy = [c for copies in dealt.values() for c in copies]
    assert len(every_copy) == len(set(every_copy))


def test_dealing_takes_what_is_left_when_copies_run_out() -> None:
    dealt = deal_copies(["u1", "u2", "u3"], _bank(1, 2), 2, random.Random(1))

    assert sorted(len(c) for c in dealt.values()) == [0, 1, 1]


def test_dealing_is_reproducible_with_the_same_seed() -> None:
    first = deal_copies(["u1", "u2"], _bank(6, 5), 2, random.Random(7))
    second = deal_copies(["u1", "u2"], _bank(6, 5), 2, random.Random(7))

    assert first == second


def test_dealing_to_nobody_deals_nothing() -> None:
    assert deal_copies([], _bank(2, 5), 2, random.Random(1)) == {}
