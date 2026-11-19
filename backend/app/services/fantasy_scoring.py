"""Fantasy: clasificación y detalle de mi jornada.

Una jornada cerrada (`settled`) lee los puntos congelados. Una bloqueada con el partido cerrado
pero sin cerrar aún (`scored`) los calcula al vuelo con las mismas reglas: propiedad de la copia
en el bloqueo y saldo negativo al bloquear. Las demás están pendientes.
"""

import random
import uuid
from collections.abc import Mapping, Sequence
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import fantasy_money_repo as money
from app.db import fantasy_repo
from app.db.models import FantasyLeague, FantasyParticipant, FantasyRoundScore, User
from app.domain.fantasy.calendar import Round, RoundStatus, is_locked, visible_rounds
from app.domain.fantasy.lineup import EMPTY_LINEUP, latest_lineup
from app.domain.fantasy.scoring import SlotScore, score_lineup
from app.domain.fantasy.standings import StandingRow, display_name, rank
from app.schemas.fantasy import RoundDetailOut, RoundOut, SlotOut, StandingRowOut, StandingsOut
from app.services.fantasy import NoLeagueError, enter, require_membership
from app.services.fantasy_results import Results, rounds_of, scored_results
from app.services.fantasy_settlement import (
    ScoringContext,
    live_score,
    load_context,
    negative_at_lock,
    slot_from_json,
)
from app.services.fantasy_team import owned_only


class NotARoundError(Exception):
    """El partido no es una jornada de la liga (amistoso, anterior a la liga o inexistente)."""


def _status(round_: Round, settled: set[str], results: Results) -> RoundStatus:
    if round_.match_id in settled:
        return RoundStatus.SETTLED
    return RoundStatus.SCORED if round_.match_id in results else RoundStatus.PENDING


def _points_by_round(
    participant_id: uuid.UUID,
    scored: Sequence[Round],
    frozen: Mapping[tuple[str, uuid.UUID], FantasyRoundScore],
    ctx: ScoringContext,
    results: Results,
) -> dict[str, int]:
    points: dict[str, int] = {}
    for r in scored:
        row = frozen.get((r.match_id, participant_id))
        if r.match_id in results:
            points[r.match_id] = live_score(ctx, participant_id, r, results[r.match_id]).points
        else:  # cerrada: congelada (0 si el participante entró después del cierre)
            points[r.match_id] = row.points if row is not None else 0
    return points


async def _round_data(
    db: AsyncSession, league: FantasyLeague, rounds: Sequence[Round], now: datetime
) -> tuple[set[str], Results]:
    """Jornadas cerradas y resultados de las provisionales (las cerradas no se recalculan)."""
    settled = await money.settled_round_ids(db, league.id)
    open_rounds = [r for r in rounds if r.match_id not in settled]
    return settled, await scored_results(db, open_rounds, now)


async def standings(
    db: AsyncSession, user: User, now: datetime, rng: random.Random
) -> StandingsOut:
    """Jornadas bloqueadas y la próxima, y la suma de puntos de las puntuadas por participante."""
    membership = await enter(db, user, now, rng)
    if membership is None:
        return StandingsOut(rounds=[], rows=[])
    league = membership.league
    rounds = visible_rounds(await rounds_of(db, league), now)
    settled, results = await _round_data(db, league, rounds, now)
    scored = [r for r in rounds if r.match_id in settled or r.match_id in results]
    participants = await fantasy_repo.list_participants(db, league.id)
    live = [r for r in scored if r.match_id in results]
    ctx = await load_context(db, [p.participant for p in participants], live)
    frozen = await money.round_scores(db, league.id, settled)
    rows = [
        StandingRow(
            participant_id=str(p.participant.id),
            display_name=display_name(p.player_name, p.email),
            points_by_round=_points_by_round(p.participant.id, scored, frozen, ctx, results),
        )
        for p in participants
    ]
    return StandingsOut(
        rounds=[
            RoundOut(
                match_id=uuid.UUID(r.match_id),
                opponent=r.opponent,
                held_on=r.held_on,
                status=_status(r, settled, results),
            )
            for r in rounds
        ],
        rows=[
            StandingRowOut(
                participant_id=uuid.UUID(row.participant_id),
                display_name=row.display_name,
                total=row.total,
                points_by_round=dict(row.points_by_round),
            )
            for row in rank(rows)
        ],
    )


async def my_round(
    db: AsyncSession, user: User, now: datetime, rng: random.Random, match_id: uuid.UUID
) -> RoundDetailOut:
    """Mi alineación de una jornada con la nota, los goles y los puntos de cada hueco.

    Si la jornada no está bloqueada todavía, muestra la alineación vigente (la que se usará).
    """
    try:
        membership = await require_membership(db, user, now, rng)
    except NoLeagueError as error:
        raise NotARoundError from error
    league, participant = membership.league, membership.participant
    round_ = next((r for r in await rounds_of(db, league) if r.match_id == str(match_id)), None)
    if round_ is None:
        raise NotARoundError
    frozen = (await money.round_scores(db, league.id, [round_.match_id])).get(
        (round_.match_id, participant.id)
    )
    if frozen is not None:
        slots = [slot_from_json(s) for s in frozen.slots]
        return await _detail_out(
            db, match_id, slots, RoundStatus.SETTLED, frozen.payout, frozen.negative_balance
        )
    if round_.match_id in await money.settled_round_ids(db, league.id):
        # Cerrada antes de que entrara en la liga: no tiene puntos.
        empty = score_lineup(EMPTY_LINEUP, {}, {})
        return await _detail_out(db, match_id, empty, RoundStatus.SETTLED, 0, False)
    return await _live_detail(db, participant, round_, match_id, now)


async def _preview(db: AsyncSession, participant: FantasyParticipant) -> list[SlotScore]:
    """Alineación vigente (aún no bloqueada) con solo las copias que son suyas ahora."""
    history = (await fantasy_repo.lineup_history(db, [participant.id])).get(participant.id, [])
    owned = {str(c.copy.id) for c in await fantasy_repo.squad(db, participant.id)}
    lineup = owned_only(latest_lineup(history), owned)
    copies = await fantasy_repo.copies_with_players(db, lineup.copy_ids())
    copy_players = {copy_id: str(player.id) for copy_id, (_, player) in copies.items()}
    return score_lineup(lineup, copy_players, {})


async def _live_detail(
    db: AsyncSession,
    participant: FantasyParticipant,
    round_: Round,
    match_id: uuid.UUID,
    now: datetime,
) -> RoundDetailOut:
    if not is_locked(round_, now):
        preview = await _preview(db, participant)
        return await _detail_out(db, match_id, preview, RoundStatus.PENDING, 0, False)
    results = await scored_results(db, [round_], now)
    ctx = await load_context(db, [participant], [round_])
    score = live_score(ctx, participant.id, round_, results.get(round_.match_id, {}))
    status = RoundStatus.SCORED if round_.match_id in results else RoundStatus.PENDING
    negative = negative_at_lock(ctx, participant.id, round_)
    return await _detail_out(db, match_id, score.slots, status, 0, negative)


async def _detail_out(
    db: AsyncSession,
    match_id: uuid.UUID,
    slots: Sequence[SlotScore],
    status: RoundStatus,
    payout: int,
    negative_balance: bool,
) -> RoundDetailOut:
    copies = await fantasy_repo.copies_with_players(db, [s.copy_id for s in slots if s.copy_id])
    names = {str(player.id): player.name for _, player in copies.values()}
    return RoundDetailOut(
        match_id=match_id,
        status=status,
        total=sum(s.points for s in slots),
        payout=payout,
        negative_balance=negative_balance,
        slots=[_slot_out(s, names) for s in slots],
    )


def _slot_out(slot: SlotScore, names: Mapping[str, str]) -> SlotOut:
    return SlotOut(
        slot=slot.slot,
        copy_id=uuid.UUID(slot.copy_id) if slot.copy_id else None,
        player_id=uuid.UUID(slot.player_id) if slot.player_id else None,
        name=names.get(slot.player_id) if slot.player_id else None,
        rating=slot.rating,
        goals=slot.goals,
        points=slot.points,
        captain=slot.captain,
    )
