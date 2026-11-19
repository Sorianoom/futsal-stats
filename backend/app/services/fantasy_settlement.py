"""Fantasy: puntos de una jornada con las reglas del mercado y cierre de jornada.

Antes del cierre, los puntos se calculan al vuelo (provisionales). Al cerrar (00:00 de Madrid del
día siguiente al partido, si está cerrado) se congelan los puntos, los cobros y los cambios de
valor: corregir después las estadísticas ya no los cambia.
"""

import uuid
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import fantasy_money_repo as money
from app.db import fantasy_repo
from app.db.models import FantasyLeague, FantasyParticipant
from app.domain.fantasy.calendar import Round, lock_time, settle_time
from app.domain.fantasy.lineup import SavedLineup, lineup_in_force
from app.domain.fantasy.market import LedgerKind
from app.domain.fantasy.scoring import PlayerResult, SlotScore
from app.domain.fantasy.settlement import (
    LedgerEntry,
    RoundScore,
    Transfer,
    balance_at,
    owners_at,
    round_score,
)
from app.domain.fantasy.values import next_value, round_payout
from app.domain.points.callup import Position


@dataclass(frozen=True, slots=True)
class ScoringContext:
    """Lo necesario para puntuar jornadas de unos participantes, cargado de una vez."""

    balances: Mapping[uuid.UUID, int]
    histories: Mapping[uuid.UUID, list[SavedLineup]]
    copy_players: Mapping[str, str]
    transfers: Sequence[Transfer]
    ledger: Mapping[uuid.UUID, list[LedgerEntry]]


async def load_context(
    db: AsyncSession, participants: Sequence[FantasyParticipant], rounds: Iterable[Round]
) -> ScoringContext:
    ids = [p.id for p in participants]
    histories = await fantasy_repo.lineup_history(db, ids)
    copy_ids = {
        c
        for history in histories.values()
        for r in rounds
        for c in lineup_in_force(history, lock_time(r.held_on)).copy_ids()
    }
    copies = await fantasy_repo.copies_with_players(db, copy_ids)
    return ScoringContext(
        balances={p.id: p.balance for p in participants},
        histories=histories,
        copy_players={copy_id: str(player.id) for copy_id, (_, player) in copies.items()},
        transfers=await money.transfers_of(db, copy_ids),
        ledger=await money.ledger_of(db, ids),
    )


def negative_at_lock(ctx: ScoringContext, participant_id: uuid.UUID, round_: Round) -> bool:
    lock = lock_time(round_.held_on)
    balance = ctx.balances.get(participant_id, 0)
    return balance_at(balance, ctx.ledger.get(participant_id, []), lock) < 0


def live_score(
    ctx: ScoringContext,
    participant_id: uuid.UUID,
    round_: Round,
    results: Mapping[str, PlayerResult],
) -> RoundScore:
    """Puntos de la alineación bloqueada: solo las copias suyas en el bloqueo, y 0 si tenía
    saldo negativo en el bloqueo."""
    lock = lock_time(round_.held_on)
    lineup = lineup_in_force(ctx.histories.get(participant_id, []), lock)
    owners = owners_at(ctx.transfers, lock)
    owned = {c for c in lineup.copy_ids() if owners.get(c) == str(participant_id)}
    return round_score(
        lineup,
        owned,
        ctx.copy_players,
        results,
        negative_balance=negative_at_lock(ctx, participant_id, round_),
    )


def slot_to_json(slot: SlotScore) -> dict[str, Any]:
    return {
        "slot": slot.slot.value,
        "copy_id": slot.copy_id,
        "player_id": slot.player_id,
        "rating": slot.rating,
        "goals": slot.goals,
        "points": slot.points,
        "captain": slot.captain,
    }


def slot_from_json(data: Mapping[str, Any]) -> SlotScore:
    return SlotScore(
        slot=Position(data["slot"]),
        copy_id=data["copy_id"],
        player_id=data["player_id"],
        rating=data["rating"],
        goals=data["goals"],
        points=data["points"],
        captain=data.get("captain", False),
    )


async def settle_round(
    db: AsyncSession,
    league: FantasyLeague,
    round_: Round,
    results: Mapping[str, PlayerResult],
) -> None:
    """Cierra la jornada: congela puntos, abona los cobros y cambia los valores. Se llama con
    la liga bloqueada y solo si la jornada no estaba cerrada."""
    settled_at = settle_time(round_.held_on)
    participants = [p.participant for p in await fantasy_repo.list_participants(db, league.id)]
    ctx = await load_context(db, participants, [round_])
    scores = []
    for participant in participants:
        score = live_score(ctx, participant.id, round_, results)
        payout = round_payout(score.points)
        if payout:
            await money.apply_movement(
                db, participant.id, payout, LedgerKind.ROUND_PAYOUT, settled_at
            )
        scores.append(
            money.FrozenScore(
                participant_id=participant.id,
                points=score.points,
                payout=payout,
                negative_balance=score.negative_balance,
                slots=[slot_to_json(s) for s in score.slots],
            )
        )
    values = _value_changes(await money.player_values(db, league.id), results)
    await money.save_settlement(
        db, league.id, uuid.UUID(round_.match_id), settled_at, scores, values
    )


def _value_changes(
    values: Mapping[str, int], results: Mapping[str, PlayerResult]
) -> dict[str, tuple[int, int]]:
    """(antes, después) de cada jugador con valor en la liga; sin nota, baja."""
    changes: dict[str, tuple[int, int]] = {}
    for player_id, before in values.items():
        result = results.get(player_id)
        rating, goals = (result.rating, result.goals) if result else (None, 0)
        changes[player_id] = (before, next_value(before, rating, goals))
    return changes
